import { guidedDemoAvailable, currentGuidedStep } from '@backend/guided-demo';
import { settlement, publicClient } from '@backend/settlement/PublicMonadSettlementProvider';
import { chain, deployment, isLocal } from '@backend/config/chain';
import { ApiError, errorResponse, serialize } from '@backend/http';
import { getRounds, shipmentPattern, preparedShipments } from '@backend/demo-rounds';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const rounds = await getRounds();
    const shipmentId = new URL(request.url).searchParams.get('shipmentId') ?? rounds.active;
    if (!shipmentPattern.test(shipmentId) || !rounds.rounds.includes(shipmentId)) throw new ApiError('Unknown demo shipment', 404);
    const blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
    const [position, balances, timeline] = await Promise.all([settlement.getFinancialPosition(shipmentId, blockNumber), settlement.balances(blockNumber), settlement.timeline(shipmentId, blockNumber)]);
    const registration = await settlement.registration(shipmentId, blockNumber);
    if (/^0x0{40}$/i.test(position.supplier)) throw new ApiError('Demo shipment is not registered on this chain', 409);
    return Response.json(serialize({ ...deployment, position, ...balances, timeline, registration, readBlock: blockNumber,
      roundBorrowed: timeline.reduce((sum, entry) => entry.eventType === 'BORROW' ? sum + BigInt(entry.amount) : sum, 0n),
      roundRepaid: position.principalRepaid,
      guidedDemo: guidedDemoAvailable(request), currentStep: currentGuidedStep(position),
      rounds, archived: shipmentId !== rounds.active, canStartRound: isLocal ? process.env.DEMO_SIGNER_ENABLED === 'true' : preparedShipments.includes(`SHIP-${String(Number(rounds.active.slice(5)) + 1).padStart(3, '0')}`),
      chainId: chain.id, network: chain.name, demoSigner: isLocal && process.env.DEMO_SIGNER_ENABLED === 'true' }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}
