import { guidedDemoAvailable, authorizeGuidedDemo } from '@backend/guided-demo';
import { isOrderProtocol } from '@backend/config/v2';
import { z } from 'zod';
import { isLocal } from '@backend/config/chain';
import { publicClient, settlement } from '@backend/settlement/PublicMonadSettlementProvider';
import { authorizeWarehouse, ApiError, errorResponse, readJson } from '@backend/http';
import { nextShipment, requireActiveShipment, saveRounds, withRoundLock } from '@backend/demo-rounds';
export const runtime = 'nodejs';
export const maxDuration = 90;
const input = z.object({ shipmentId: z.string().regex(/^SHIP-\d{3,4}$/) }).strict();

export async function POST(request: Request) {
  try {
    const guided = guidedDemoAvailable(request);
    if (!guided && isLocal && process.env.DEMO_SIGNER_ENABLED !== 'true') throw new ApiError('Local demo registration is disabled', 403);
    if (guided) authorizeGuidedDemo(request); else authorizeWarehouse(request);
    const body = input.parse(await readJson(request));
    return await withRoundLock(async () => {
      const rounds = await requireActiveShipment(body.shipmentId);
      const current = await settlement.getFinancialPosition(rounds.active);
      if (isOrderProtocol ? current.status !== 'CLOSED' || !current.buyerPaid : !['DELIVERED', 'CLOSED'].includes(current.status)) throw new ApiError('Complete buyer payment and close the order before starting a new demo round',409);
      const shipmentId = nextShipment(rounds);
      let next = await settlement.getFinancialPosition(shipmentId);
      if (/^0x0{40}$/i.test(next.supplier)) {
        if (!isLocal) throw new ApiError('Next testnet demo shipment is not registered', 409);
        await settlement.registerLocalShipment(shipmentId);
      }
      const block = await publicClient.getBlockNumber({ cacheTime: 0 });
      next = await settlement.getFinancialPosition(shipmentId, block);
      if (next.status !== 'NONE' || next.outstandingDebt !== 0n || next.verifiedInventoryValue !== 0n || next.supplier.toLowerCase() !== current.supplier.toLowerCase() || (isOrderProtocol && (next.buyerPaid || next.buyer.toLowerCase() !== current.buyer.toLowerCase() || next.orderAmount !== current.orderAmount))) throw new ApiError('Next shipment is not a fresh registered demo round', 409);
      const registration = await settlement.registration(shipmentId, block);
      const updated = { active: shipmentId, rounds: [...rounds.rounds, shipmentId] };
      await saveRounds(updated);
      return Response.json({ shipmentId, rounds: updated, registration, settlement: 'CONFIRMED' });
    });
  } catch (error) { return errorResponse(error); }
}
