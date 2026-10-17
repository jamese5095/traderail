import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Hash } from 'viem';
import { deployment } from './config/chain';
import { ApiError } from './http';
import { publicClient } from './settlement/PublicMonadSettlementProvider';
import { withRoundLock } from './demo-rounds';

type Record = { eventId: string; fingerprint: string; hash?: Hash; state: string; block?: string; settlement?: string; error?: string };
async function location() {
  const anchor = (await publicClient.getBlock({ blockNumber: BigInt(deployment.deploymentBlock) })).hash;
  const dir = join(process.env.DEMO_SESSION_DIR ?? resolve(process.cwd(), '.demo-sessions'), `transactions-${deployment.chainId}-${deployment.protocol}-${anchor}`);
  await mkdir(dir, { recursive: true }); return dir;
}
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
async function save(file: string, value: Record) { const temp = `${file}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await rename(temp,file); }
export async function transactionStatus(hash: Hash) {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return { hash, state: receipt.status === 'success' ? 'confirmed' : 'failed', settlement: receipt.status === 'success' ? 'CONFIRMED' : 'FAILED', block: String(receipt.blockNumber) };
  } catch (e) {
    if ((e as Error).name === 'TransactionReceiptNotFoundError') return { hash, state: 'confirming', settlement: 'PENDING' };
    return { hash, state: 'unknown', settlement: 'UNKNOWN' };
  }
}
export async function submitTransaction(eventId: string, payload: unknown, send: () => Promise<Hash>, options: { retryPreflight?: boolean } = {}) {
  return withRoundLock(async () => {
    const dir = await location(); const file = join(dir, digest(eventId) + '.json'); const pendingFile = join(dir, 'pending.json');
    const fingerprint = digest(JSON.stringify(payload, (_, v) => typeof v === 'bigint' ? String(v) : v));
    let record: Record | undefined;
    try { record = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (record) {
      if (record.fingerprint !== fingerprint) throw new ApiError('eventId conflicts with a different payload',409);
      if (record.hash) { Object.assign(record, await transactionStatus(record.hash)); await save(file,record); }
      if (record.state === 'failed' && !record.hash) {
        if (!options.retryPreflight) throw new ApiError(record.error ?? 'Preflight rejected; no transaction submitted', 409);
        // Only a proven pre-broadcast rejection may be retried, with the identical business identity.
      } else return record;
    }
    try {
      const pending = JSON.parse(await readFile(pendingFile, 'utf8')) as Record;
      const status = pending.hash ? await transactionStatus(pending.hash) : pending;
      if (!['confirmed','failed'].includes(status.state)) throw new ApiError('Previous transaction is pending or unknown. Resolve its original hash before another submission.',409);
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    record = { eventId, fingerprint, state: 'unknown' }; await save(file, record); await save(pendingFile,record);
    try {
      record.hash = await send(); record.state = 'submitted'; record.settlement = 'SUBMITTED';
      await save(file,record); await save(pendingFile,record);
      // Instant local receipts retain legacy confirmed responses; public RPC returns the hash immediately.
      Object.assign(record, await transactionStatus(record.hash)); await save(file,record); await save(pendingFile,record);
      return record;
    } catch (e) {
      // Only a known preflight rejection proves no transaction was broadcast.
      if (e instanceof ApiError) { record.state = 'failed'; record.error = 'Preflight rejected; no transaction submitted'; }
      else { record.state = 'unknown'; record.error = 'Submission outcome unknown; automatic resend is blocked'; }
      await save(file,record); await save(pendingFile,record); throw e;
    }
  });
}

export async function businessStatus(eventId: string, absentState = 'unknown') {
  try {
    const record = JSON.parse(await readFile(join(await location(), digest(eventId) + '.json'), 'utf8')) as Record;
    return record.hash ? { eventId, ...await transactionStatus(record.hash) } : { eventId, state: record.state, error: record.error };
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { eventId, state: absentState }; throw e; }
}
