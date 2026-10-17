'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, History, ShieldCheck } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import { useDemo } from '@/lib/use-demo';
import { LiveSettlement } from '@/components/live-settlement';

function Verification() {
  const { t, statusLabel, message } = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const { data, connectionError, selectRound } = useDemo();
  const from = params.get('from') === 'erp' ? 'erp' : params.get('from') === 'guide' ? 'guide' : 'overview';
  const hidden = params.get('view') === 'private';
  const requestedHash = params.get('tx') ?? '';
  const requestedInvalid = !!data && !!requestedHash && ![data.registration.hash, ...data.timeline.map(entry => entry.hash)].includes(requestedHash);
  const hash = requestedHash || data?.timeline.at(-1)?.hash || data?.registration.hash || '';
  const updateQuery = (field: 'tx' | 'view', value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(field, value); else next.delete(field);
    if (data) next.set('shipmentId', data.position.shipmentId);
    router.replace(`/verification?${next}`, { scroll: false });
  };
  const returnQuery = new URLSearchParams();
  if (data) returnQuery.set('shipmentId', data.position.shipmentId);
  if (hidden && from === 'overview') returnQuery.set('view', 'private');
  const returnHref = (from === 'erp' ? '/erp' : from === 'guide' ? '/' : '/finance') + (returnQuery.size ? `?${returnQuery}` : '') + '#demo-controls';
  return <>
    <div className="page-heading verification-heading"><div><h1>{t('Events & onchain verification')}<span className="title-dot">.</span></h1></div><span className="verification-readonly"><ShieldCheck size={15} />{t('Read-only verification')}</span></div>
    <section className="verification-round-bar" aria-label={t('Verification context')}><div><small>{t('Shipment being verified')}</small><strong>{data?.position.shipmentId ?? params.get('shipmentId') ?? '—'}{data && <span className={`status status-${data.position.status.toLowerCase()}`}>{statusLabel(data.position.status)}</span>}</strong></div><label><History size={15} />{t('View round')}<select aria-label={t('View round')} disabled={!data} value={data?.position.shipmentId ?? ''} onChange={event => selectRound(event.target.value)}>{!data && <option value="">—</option>}{data?.rounds.rounds.map(id => <option key={id} value={id}>{id} · {t(id === data.rounds.active ? 'Active' : 'Archived')}</option>)}</select></label><Link className="outline-button" href={returnHref}><ArrowLeft size={15} />{t(from === 'erp' ? 'Return to Warehouse ERP' : from === 'guide' ? 'Return to order journey' : 'Return to financial overview')}</Link></section>
    {hidden && <div className="privacy-banner"><ShieldCheck size={17} /><p><strong>{t('Selective disclosure concept.')}</strong> {t('Values are masked in this UI; the current contracts and API remain public.')}</p><button className="outline-button" onClick={() => updateQuery('view', '')}>{t('Show financial amounts')}</button></div>}
    {connectionError && <div className="alert error" role="alert">{message(connectionError)} <Link href="/verification">{t('View active round')}</Link></div>}
    {requestedInvalid ? <div className="alert error" role="alert">{t('Requested transaction does not belong to this shipment.')} <button className="outline-button" onClick={() => updateQuery('tx', '')}>{t('View latest confirmed transaction')}</button></div> : <LiveSettlement data={data} selectedHash={hash} onSelectHash={value => updateQuery('tx', value)} returnHref={returnHref} hidden={hidden} />}
  </>;
}

export default function VerificationPage() {
  return <Suspense fallback={<div className="page-loading" role="status">…</div>}><Verification /></Suspense>;
}
