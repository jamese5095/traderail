'use client';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import { money, shortAddress, type Snapshot } from '@/lib/types';

export function confirmationHref(data: Snapshot, from: 'erp' | 'overview', hidden = false) {
  const query = new URLSearchParams({ shipmentId: data.position.shipmentId, tx: data.timeline.at(-1)?.hash ?? data.registration.hash, from });
  if (hidden) query.set('view', 'private');
  return `/verification?${query}`;
}

export function ConfirmationResult({ data, busy, failure, connectionError, submittedHash, from, hidden = false }: { data: Snapshot | null; busy: string; failure: string; connectionError: string; submittedHash: string; from: 'erp' | 'overview'; hidden?: boolean }) {
  const { t, eventLabel, message } = useLocale();
  const entry = data?.timeline.at(-1);
  const amount = (value: string) => hidden ? t('PRIVATE') : '$' + money(value);
  let result = t('Registered shipment. Ready for the first business event.');
  if (entry?.eventType === 'GOODS_RECEIVED') result = t('Borrowing power created: {amount}', { amount: amount(entry.after.power) });
  if (entry?.eventType === 'BORROW') result = t('Supplier received {amount} mock USDC', { amount: amount(entry.amount) });
  if (entry?.eventType === 'GOODS_OUTBOUND') result = t('New borrowing frozen · debt retained: {amount}', { amount: amount(entry.after.debt) });
  if (entry?.eventType === 'DELIVERED') result = t('Delivery recognized · debt retained: {amount}', { amount: amount(entry.after.debt) });
  if (entry?.eventType === 'ORDER_SETTLED') result = t('Buyer payment · {amount}', { amount: amount(entry.amount) });
  if (entry?.eventType === 'REPAID') result = t('Principal repaid: {amount}', { amount: amount(entry.amount) });
  if (data?.position.status === 'CLOSED') result = t('Delivered and principal fully repaid. Shipment closed.');
  const block = entry?.block ?? data?.registration.block;
  return <section className={`confirmation-result ${busy || failure || connectionError ? 'confirmation-attention' : ''}`} aria-label={t('Latest confirmed result')}>
    <div className="confirmation-symbol">{data ? <CheckCircle2 size={23} /> : <ShieldCheck size={23} />}</div>
    <div className="confirmation-copy"><span className="confirmation-label">{busy ? t('Awaiting confirmation') : failure ? t('Action not confirmed') : connectionError ? t('Live read unavailable') : t('Latest confirmed result')}</span>
      <strong>{data ? `${entry ? eventLabel(entry.eventType) : t('Shipment registration')} · ${data.position.shipmentId}` : t('Connecting…')}</strong>
      <p>{data ? result : t('Reading confirmed chain state…')}{block && <span> · {t('Block')} {block}</span>}</p>
      {(busy || failure || connectionError) && <small>{busy ? t('Displayed result is the last confirmed transaction.') : message(failure || connectionError)}{busy && submittedHash && ` · ${shortAddress(submittedHash)}`}</small>}
    </div>
    {data && <Link className="confirmation-link" href={confirmationHref(data, from, hidden)}>{t('View onchain proof')}<ArrowRight size={16} /></Link>}
  </section>;
}
