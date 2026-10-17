import { requireActiveShipment } from '@backend/demo-rounds';
import { parseUnits } from 'viem';
import { z } from 'zod';
import { isLocal } from '@backend/config/chain';
import { settlement } from '@backend/settlement/PublicMonadSettlementProvider';
import { ApiError, errorResponse, readJson, requireLocalOrigin } from '@backend/http';
import { submitTransaction } from '@backend/transactions';
export const runtime = 'nodejs';
const input = z.object({ eventId: z.string().min(1).max(128), shipmentId: z.string().regex(/^SHIP-\d{3,4}$/), amount: z.string().regex(/^\d{1,10}(\.\d{1,6})?$/) }).strict();
export async function POST(request: Request) {
  try {
    if (!isLocal || process.env.DEMO_SIGNER_ENABLED !== 'true') throw new ApiError('Use supplier wallet on public networks', 403);
    requireLocalOrigin(request); const e = input.parse(await readJson(request));
    const result = await submitTransaction(e.eventId, { action: 'repay', shipmentId: e.shipmentId, amount: e.amount }, async () => {
      await requireActiveShipment(e.shipmentId); return settlement.executeRepay(e.shipmentId, parseUnits(e.amount,6));
    });
    return Response.json(result, { status: result.state === 'confirmed' ? 200 : 202 });
  } catch(e) { return errorResponse(e); }
}
