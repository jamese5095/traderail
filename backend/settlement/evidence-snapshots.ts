import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Hash } from 'viem';
import { isOrderProtocol, orderDeployment } from '../config/v2';
import { chain, deployment } from '../config/chain';
import { ApiError, serialize } from '../http';
import { publicClient, settlement } from './PublicMonadSettlementProvider';

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const integer = z.string().regex(/^\d+$/);
const positionSchema = z.object({ shipmentId: z.string(), supplier: addressSchema, buyer: addressSchema, orderAmount: integer, buyerPaid: z.boolean(), principalRepaid: integer, supplierProceeds: integer, verifiedInventoryValue: integer,
  borrowingPower: integer, outstandingDebt: integer, availableCredit: integer, quantity: integer,
  status: z.enum(['NONE', 'RECEIVED', 'COLLATERALIZED', 'OUTBOUND', 'DELIVERED', 'CLOSED']) });
const balancesSchema = z.object({ supplierBalance: integer, poolBalance: integer, buyerBalance: integer });
const savedSchema = z.object({ identity: z.string(), positionAtBlock: positionSchema, balancesAtBlock: balancesSchema });
const metadataSchema = z.object({ chainId: z.number().int().positive(), protocol: addressSchema, usdc: addressSchema,
  supplier: addressSchema, buyer: addressSchema.optional(), protocolVersion: z.number().optional(), deploymentBlock: integer, deploymentBlockHash: hashSchema });

/** The receipt is fetched independently on every request. Saved state is never a replacement for receipt verification. */
export async function evidenceSnapshot(shipmentId: string, blockNumber: bigint, blockHash: Hash) {
  const metadata = metadataSchema.safeParse(deployment);
  if (!metadata.success) throw new ApiError('Deployment metadata lacks a valid chain/deployment identity', 409);
  const m = metadata.data;
  if (isOrderProtocol && !m.buyer) throw new ApiError('Order deployment metadata requires buyer identity',409);
  const [actualChain, anchor, receiptBlock, code] = await Promise.all([
    publicClient.getChainId(), publicClient.getBlock({ blockNumber: BigInt(m.deploymentBlock) }),
    publicClient.getBlock({ blockNumber }), publicClient.getBytecode({ address: m.protocol as `0x${string}` }),
  ]);
  if (actualChain !== chain.id || actualChain !== m.chainId || anchor.hash?.toLowerCase() !== m.deploymentBlockHash.toLowerCase() ||
      receiptBlock.hash?.toLowerCase() !== blockHash.toLowerCase() || !code || code === '0x' || blockNumber < BigInt(m.deploymentBlock)) {
    throw new ApiError('Chain, deployment, or receipt block identity mismatch', 409);
  }
  const identity = [actualChain, m.deploymentBlockHash.toLowerCase(), m.protocol.toLowerCase(), m.usdc.toLowerCase(),
    m.supplier.toLowerCase(), m.buyer?.toLowerCase() ?? 'legacy', m.protocolVersion ?? 1, blockNumber, blockHash.toLowerCase(), shipmentId].join(':');
  const directory = join(process.env.DEMO_SESSION_DIR ?? resolve(process.cwd(), '.demo-sessions'), 'evidence-snapshots');
  const file = join(directory, createHash('sha256').update(identity).digest('hex') + '.json');
  try {
    const [position, balances] = await Promise.all([
      settlement.getFinancialPosition(shipmentId, blockNumber), settlement.balances(blockNumber),
    ]);
    const snapshot = savedSchema.parse(serialize({ identity, positionAtBlock: position, balancesAtBlock: balances }));
    if (snapshot.positionAtBlock.supplier.toLowerCase() !== m.supplier.toLowerCase() || snapshot.positionAtBlock.shipmentId !== shipmentId || (isOrderProtocol && snapshot.positionAtBlock.buyer.toLowerCase() !== orderDeployment.buyer?.toLowerCase())) {
      throw new ApiError('Historical position does not match deployment supplier/shipment', 409);
    }
    // Check canonical membership again after the state reads before persisting their association.
    if ((await publicClient.getBlock({ blockNumber })).hash?.toLowerCase() !== blockHash.toLowerCase()) {
      throw new ApiError('Receipt block changed during historical state read', 409);
    }
    try {
      await mkdir(directory, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 }); await rename(temporary, file);
    } catch { /* A read-only filesystem does not invalidate successful RPC state reads. */ }
    return { positionAtBlock: snapshot.positionAtBlock, balancesAtBlock: snapshot.balancesAtBlock,
      snapshotSource: 'rpc' as const, snapshotNote: 'Historical contract state read from RPC at the verified receipt block.' };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    try {
      const saved = savedSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      if (saved.identity === identity && saved.positionAtBlock.shipmentId === shipmentId && saved.positionAtBlock.supplier.toLowerCase() === m.supplier.toLowerCase() && (!isOrderProtocol || saved.positionAtBlock.buyer.toLowerCase() === m.buyer?.toLowerCase())) {
        return { positionAtBlock: saved.positionAtBlock, balancesAtBlock: saved.balancesAtBlock,
          snapshotSource: 'saved' as const, snapshotNote: 'Previously saved historical RPC state; chain, deployment and receipt block identities verified now. State was not freshly read from RPC.' };
      }
    } catch { /* Missing or invalid cached state must never be replaced with current state. */ }
    return { positionAtBlock: null, balancesAtBlock: null, snapshotSource: 'unavailable' as const,
      snapshotNote: 'Historical contract state unavailable; event/Transfer evidence remains verified' };
  }
}
