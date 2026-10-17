import type { RailMode, RailOrderView, RailStep } from './rail-types';

export type MoneyMotion = 'fund' | 'advance' | 'pay';
export function confirmed(order: RailOrderView | null | undefined, step: string) {
  return order?.operations[step]?.state === 'confirmed';
}

// A latest-state read can lead finalized receipts. The stage only celebrates
// capital movements after their own successful, finalized operation receipt.
export function presentationState(order: RailOrderView | null | undefined, choice: RailMode) {
  const financed = (order?.mode ?? choice) === 'financed';
  const accepted = !!order?.records.some(record => record.kind === 'accepted');
  const funded = confirmed(order, 'fund');
  const advanced = confirmed(order, 'advance') && Number(order?.advance ?? 0) > 0;
  const paid = confirmed(order, 'pay') && !!order?.paid;
  const synced = paid && !!order?.syncedAt;
  const advance = advanced ? Number(order!.advance) / 1e6 : 0;
  const proceeds = paid ? Number(order!.proceeds) / 1e6 : 0;
  const principal = paid ? Number(order!.principalReturned) / 1e6 : 0;
  const interest = paid ? Number(order!.interestPaid) / 1e6 : 0;
  const act = !accepted ? 0 : financed ? advanced ? 2 : 1 : paid ? 2 : 1;
  const done = [accepted, financed ? advanced : paid, synced];
  const boundary: RailStep = !accepted ? financed ? 'fund' : 'pay' : financed && !advanced ? 'pay' : 'complete';
  return { financed, accepted, funded, advanced, paid, synced, advance, proceeds,
    principal, interest, total: advance + proceeds, debt: advanced && !paid ? advance + 1000 : 0,
    escrow: funded && !advanced ? Number(order?.escrow ?? 0) / 1e6 : 0, act, done, boundary };
}

export const moneyMotions: MoneyMotion[] = ['fund', 'advance', 'pay'];
export function confirmedMotions(order: RailOrderView | null | undefined) {
  return moneyMotions.flatMap(step => {
    const op = order?.operations[step];
    return op?.state === 'confirmed' && op.hash ? [{ step, hash: op.hash }] : [];
  });
}
