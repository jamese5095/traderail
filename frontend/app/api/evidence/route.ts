import { z } from 'zod';
import { orderDeployment } from '@backend/config/v2';
import { evidenceSnapshot } from '@backend/settlement/evidence-snapshots';
import { decodeEventLog, keccak256, stringToHex, type Abi, type Hash } from 'viem';
import { chain, deployment } from '@backend/config/chain';
import { publicClient, settlement } from '@backend/settlement/PublicMonadSettlementProvider';
import { getRounds, shipmentPattern } from '@backend/demo-rounds';
import { ApiError, errorResponse, serialize } from '@backend/http';
import protocolAbi from '@/lib/protocol-abi.json';
import usdcAbi from '@/lib/usdc-abi.json';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(params.get('hash')) as Hash;
    const rounds = await getRounds();
    const shipmentId = params.get('shipmentId') ?? rounds.active;
    if (!shipmentPattern.test(shipmentId) || !rounds.rounds.includes(shipmentId)) throw new ApiError('Unknown demo shipment', 404);
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const id = keccak256(stringToHex(shipmentId));
    const events = receipt.logs.flatMap(log => {
      const address = log.address.toLowerCase();
      const abi = address === deployment.protocol.toLowerCase() ? protocolAbi : address === deployment.usdc.toLowerCase() ? usdcAbi : null;
      if (!abi) return [];
      try {
        const decoded = decodeEventLog({ abi: abi as Abi, topics: log.topics, data: log.data });
        if (!decoded.eventName || !decoded.args || Array.isArray(decoded.args)) return [];
        return [{ address: log.address, name: decoded.eventName, args: decoded.args as unknown as Record<string, unknown>, logIndex: log.logIndex }];
      } catch { return []; }
    });
    if (!events.some(event => ['FinancialStateChanged', 'ShipmentRegistered'].includes(event.name) && event.args.shipmentId === id)) throw new ApiError('Transaction does not belong to this shipment', 404);
    const [snapshot, timeline, head] = await Promise.all([
      evidenceSnapshot(shipmentId, receipt.blockNumber, receipt.blockHash),
      settlement.timeline(shipmentId, receipt.blockNumber), publicClient.getBlockNumber({ cacheTime: 0 }),
    ]);
    const transition = timeline.find(entry => entry.hash === hash) ?? null;
    const protocol = deployment.protocol.toLowerCase(), supplier = deployment.supplier.toLowerCase(), buyer = orderDeployment.buyer?.toLowerCase();
    const transfers = events.filter(event => {
      if (event.name !== 'Transfer' || event.address.toLowerCase() !== deployment.usdc.toLowerCase()) return false;
      const from = String(event.args.from).toLowerCase(), to = String(event.args.to).toLowerCase();
      return (from === protocol && to === supplier) || (from === supplier && to === protocol) || (from === buyer && to === protocol);
    });
    return Response.json(serialize({ hash, shipmentId, status: receipt.status, block: receipt.blockNumber, blockHash: receipt.blockHash,
      chainId: chain.id, network: chain.name, from: receipt.from, to: receipt.to, gasUsed: receipt.gasUsed,
      confirmations: head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n,
      events, transfers, transition, ...snapshot }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
