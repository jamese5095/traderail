import { z } from 'zod';
import { authorizeGuidedDemo, executeGuidedStep, guidedEventId, guidedSteps } from '@backend/guided-demo';
import { requireActiveShipment, getRounds } from '@backend/demo-rounds';
import { businessStatus, submitTransaction } from '@backend/transactions';
import { ApiError, errorResponse, readJson } from '@backend/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;
const input = z.object({ shipmentId: z.string().regex(/^SHIP-\d{3,4}$/), step: z.enum(guidedSteps) }).strict();
export async function GET(request: Request) {
  try {
    authorizeGuidedDemo(request);
    const query = new URL(request.url).searchParams;
    const { shipmentId, step } = input.parse({ shipmentId: query.get('shipmentId'), step: query.get('step') });
    if (!(await getRounds()).rounds.includes(shipmentId)) throw new ApiError('Unknown demo shipment',404);
    return Response.json(await businessStatus(guidedEventId(shipmentId,step),'absent'), { headers: { 'Cache-Control': 'no-store' } });
  } catch(e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    authorizeGuidedDemo(request);
    const { shipmentId, step } = input.parse(await readJson(request));
    const eventId = guidedEventId(shipmentId,step);
    const result = await submitTransaction(eventId, { shipmentId, step }, async () => {
      await requireActiveShipment(shipmentId);
      return executeGuidedStep(shipmentId,step,eventId);
    }, { retryPreflight: true });
    return Response.json(result, { status: result.state === 'confirmed' ? 200 : 202 });
  } catch(e) { return errorResponse(e); }
}
