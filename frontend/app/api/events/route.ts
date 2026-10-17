import { requireActiveShipment } from '@backend/demo-rounds';
import { normalizeEvent } from '@backend/events';
import { settlement } from '@backend/settlement/PublicMonadSettlementProvider';
import { authorizeWarehouse, errorResponse, readJson, serialize } from '@backend/http';
import { submitTransaction } from '@backend/transactions';
export const runtime = 'nodejs';
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    authorizeWarehouse(request);
    const event = normalizeEvent(await readJson(request));
    const { timestamp, ...payload } = event;
    const result = await submitTransaction(event.eventId, payload, async () => {
      await requireActiveShipment(event.shipmentId);
      return settlement.submitSupplyChainEvent(event);
    });
    return Response.json(serialize({ ...result, event }), { status: result.state === 'confirmed' ? 200 : 202 });
  } catch (e) { return errorResponse(e); }
}
