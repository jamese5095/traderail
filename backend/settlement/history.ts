import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodeEventLog, type Abi, type PublicClient } from 'viem';
import { deployment, isLocal } from '../config/chain';
import abi from '../../frontend/lib/protocol-abi.json';

type Item = { eventName: string; args: Record<string, any>; transactionHash: `0x${string}`; blockHash?: string; blockNumber: bigint; logIndex: number };
type Index = { cursor: bigint; anchor: string; tipHash?: string; logs: Item[]; times: Record<string, string>; timeHashes?: Record<string, string> };
const directory = process.env.DEMO_SESSION_DIR ?? resolve(process.cwd(), '.demo-sessions');
const encode = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? { $bigint: String(x) } : x);
// Monad's public RPC limits eth_getLogs to 100 blocks, including both endpoints.
const windowSize = isLocal ? 1000n : 100n;
let cached: Index | undefined;
let inFlight: Promise<Index> | undefined;

async function sync(client: PublicClient): Promise<Index> {
  const deploymentBlock = BigInt(deployment.deploymentBlock);
  const [tip, deploymentHeader] = await Promise.all([
    client.getBlock({ blockTag: 'latest' }), client.getBlock({ blockNumber: deploymentBlock }),
  ]);
  const head = tip.number!;
  const anchor = deploymentHeader.hash!;
  const file = join(directory, `history-${deployment.chainId}-${deployment.protocol}-${anchor}.json`);
  let index: Index = { cursor: deploymentBlock - 1n, anchor, logs: [], times: {}, timeHashes: {} };
  if (cached?.anchor === anchor) index = cached;
  else {
    try { index = JSON.parse(await readFile(file, 'utf8'), (_, x) => x && typeof x === 'object' && '$bigint' in x ? BigInt(x.$bigint) : x); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  // Check both height and hash: a same-height reorg still requires the overlap scan.
  if (index.cursor === head && index.tipHash === tip.hash) { cached = index; return index; }
  const start = index.cursor > head ? deploymentBlock : index.cursor - 5n > deploymentBlock ? index.cursor - 5n : deploymentBlock;
  // Do not mutate the shared last successful snapshot if an RPC request fails midway.
  index = { ...index, logs: index.logs.filter(log => log.blockNumber < start), times: { ...index.times }, timeHashes: { ...index.timeHashes } };
  for (let from = start; from <= head; from += windowSize) {
    const logs = await client.getLogs({ address: deployment.protocol as `0x${string}`, fromBlock: from, toBlock: from + windowSize - 1n < head ? from + windowSize - 1n : head });
    for (const log of logs) {
      try {
        const event = decodeEventLog({ abi: abi as Abi, data: log.data, topics: log.topics });
        index.logs.push({ eventName: event.eventName!, args: event.args as Item['args'], transactionHash: log.transactionHash!, blockHash: log.blockHash!, blockNumber: log.blockNumber!, logIndex: log.logIndex! });
      } catch { /* Unknown ABI event is not financial evidence. */ }
    }
  }
  index.logs = [...new Map(index.logs.map(log => [`${log.transactionHash}:${log.logIndex}`, log])).values()].sort((a,b) => a.blockNumber === b.blockNumber ? a.logIndex-b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
  const timeHashes = index.timeHashes!;
  for (const log of index.logs.filter(log => log.blockNumber >= start)) {
    const number = String(log.blockNumber);
    // A cached timestamp is reusable only for the identical canonical block hash.
    if (index.times[number] !== undefined && log.blockHash && timeHashes[number] === log.blockHash) continue;
    const block = log.blockNumber === head ? tip : await client.getBlock({ blockNumber: log.blockNumber });
    if (log.blockHash && block.hash !== log.blockHash) throw new Error('Chain reorganized during history synchronization; retry the read');
    index.times[number] = String(block.timestamp); timeHashes[number] = block.hash!;
  }
  index.cursor = head; index.tipHash = tip.hash!;
  await mkdir(directory, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`; await writeFile(temporary, encode(index), { mode: 0o600 }); await rename(temporary, file);
  cached = index;
  return index;
}

export async function history(client: PublicClient, requestedHead: bigint): Promise<Index> {
  // Timeline and registration requests share the same unfiltered live-chain sync.
  // Each caller applies its own historical cutoff without moving the saved cursor.
  if (!inFlight) {
    const work = sync(client);
    inFlight = work;
    void work.finally(() => { if (inFlight === work) inFlight = undefined; }).catch(() => {});
  }
  const index = await inFlight;
  // A caller can arrive with a newer head while an earlier sync is in progress.
  if (index.cursor < requestedHead) {
    const current = await client.getBlockNumber({ cacheTime: 0 });
    if (current >= requestedHead) return history(client, requestedHead);
  }
  return { ...index, logs: index.logs.filter(log => log.blockNumber <= requestedHead) };
}
