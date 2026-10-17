'use client';
import { RotateCcw, History, ArrowRight } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import type { Snapshot } from '@/lib/types';

export function DemoRound({ data, busy, startRound, selectRound, readOnly = false }: { data: Snapshot | null; busy: string; startRound: () => Promise<void>; selectRound: (id: string) => void; readOnly?: boolean }) {
  const { t } = useLocale();
  return <section className="demo-round-bar" aria-label={t('Demo rounds')}>
    <div><strong>{t('Live demo round')} <span>{data?.position.shipmentId ?? '—'}</span></strong><p>{t('A new shipment starts at zero credit and debt. Previous transactions and wallet funds remain onchain.')}</p></div>
    <label><History size={14} /><span>{t('View round')}</span><select aria-label={t('View round')} disabled={!data || !!busy} value={data?.position.shipmentId ?? ''} onChange={event => selectRound(event.target.value)}>{!data && <option value="">—</option>}{data?.rounds.rounds.map(id => <option key={id} value={id}>{id}{id === data.rounds.active ? ` · ${t('Active')}` : ` · ${t('Archived')}`}</option>)}</select></label>
    {data?.archived ? <button className="outline-button" disabled={!!busy} onClick={() => selectRound('')}>{t('Return to active round')}<ArrowRight size={14} /></button> : <button className="outline-button" disabled={readOnly || !data || !!busy || data.position.status !== 'CLOSED' || !data.canStartRound} onClick={() => void startRound()}><RotateCcw size={14} />{busy === 'NEW DEMO ROUND' ? t('Preparing new round…') : t('Start next shipment')}</button>}
    {data && !data.canStartRound && !data.archived && <small>{t('No next round is configured. Register more shipments and redeploy the demo configuration.')}</small>}
    {data?.archived && <small>{t('Archived round: read-only. Previous debt and receipts are preserved.')}</small>}
  </section>;
}
