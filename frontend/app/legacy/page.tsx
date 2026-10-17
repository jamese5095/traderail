'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { ArrowRight, Check, Package, Warehouse, Truck, ShoppingBag, Wallet, Landmark, Play, Pause, RotateCcw, ShieldCheck, ChevronDown } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import { useGuidedDemo, type GuidedStep } from '@/lib/use-guided-demo';
import { money } from '@/lib/types';
import { Timeline } from '@/components/timeline';
import { ChainEvidence } from '@/components/chain-evidence';
import { isLocal, explorerUrl } from '@backend/config/chain';

const stepCopy: Record<GuidedStep, { title: string; action: string; description: string }> = {
  receive: { title: 'The goods are ready. Working capital is not.', action: 'Confirm warehouse intake', description: 'A supplier has a ${order} order ready to ship and needs 50,000 to prepare the next order.' },
  borrow: { title: 'Verified goods unlock working capital.', action: 'Advance 50,000 to supplier', description: 'The warehouse has confirmed the goods. The supplier can now draw 50,000 from the funding pool.' },
  outbound: { title: 'The supplier has funds. The goods can move.', action: 'Ship the goods', description: 'The order leaves the warehouse for the buyer. New borrowing must stop when the collateral leaves.' },
  deliver: { title: 'The goods are on their way to the buyer.', action: 'Buyer confirms receipt', description: 'The buyer confirms delivery. Signing for the goods does not repay the supplier’s advance.' },
  settle: { title: 'The buyer received the goods. Time to pay.', action: 'Buyer pays {order}', description: 'One buyer payment repays the funding pool first, then sends the remaining order proceeds to the supplier.' },
};
function GuidedPage() {
  const { t } = useLocale();
  const demo = useGuidedDemo();
  const { data, busy, automatic, mode, state, pending, error } = demo;
  const [selectedHash, setSelectedHash] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const step = data?.currentStep ?? 'receive';
  const complete = step === 'complete';
  const copy = stepCopy[complete ? 'settle' : step];
  const entries = data?.timeline ?? [];
  const has = (event: string) => entries.some(entry => entry.eventType === event);
  const borrowed = has('BORROW');
  const received = has('GOODS_RECEIVED');
  const delivered = has('DELIVERED');
  const outbound = has('GOODS_OUTBOUND');
  const latest = entries.at(-1);
  const settlement = entries.findLast(entry => entry.eventType === 'ORDER_SETTLED');
  const settlementSummary = t('One transaction: {payment} payment → {principal} principal + {proceeds} remaining proceeds.', { payment: money(settlement?.payment ?? data?.position.orderAmount), principal: money(settlement?.principal), proceeds: money(settlement?.supplierProceeds) });
  const hash = entries.some(entry => entry.hash === selectedHash) ? selectedHash : latest?.hash ?? data?.registration.hash ?? '';
  const figures = { order: data ? money(data.position.orderAmount) : '—', advance: money(data?.roundBorrowed), debt: money(data?.position.outstandingDebt), principal: money(settlement?.principal), proceeds: money(settlement?.supplierProceeds ?? data?.position.supplierProceeds), credit: money(latest?.after.power), repaid: money(latest?.amount) };
  const latestSummary = complete ? settlementSummary : latest?.eventType === 'DELIVERED' ? t('Delivery is confirmed. The order is awaiting buyer payment.') : latest?.eventType === 'GOODS_OUTBOUND' ? t('Available credit is zero. Outstanding principal remains {debt}.', figures) : latest?.eventType === 'BORROW' ? t('This shipment received {advance}; outstanding principal is {debt}.', figures) : latest?.eventType === 'GOODS_RECEIVED' ? t('Warehouse receipt created {credit} of borrowing power.', figures) : latest?.eventType === 'REPAID' ? t('Principal repaid: {repaid}. Outstanding principal is {debt}.', figures) : t('The goods are ready. Start the first warehouse confirmation.');
  const disabled = !data || !data.guidedDemo || data.archived || busy || !!pending;
  const query = data ? `?shipmentId=${encodeURIComponent(data.position.shipmentId)}` : '';
  return <div className="guided-page"><p className="legacy-banner">V2 · {t("Legacy deployment and historical records")}</p>
    <div className="guided-meta"><span><span className="network-dot"/>{t(isLocal ? 'Preset test roles · real local EVM execution · MockUSDC' : 'Preset test roles · real Monad execution · MockUSDC')}</span><button onClick={() => setHistoryOpen(!historyOpen)}>{data?.position.shipmentId ?? '…'} <ChevronDown size={15}/></button></div>
    {historyOpen && <div className="guided-history"><label>{t('View round')}<select disabled={busy} value={data?.position.shipmentId ?? ''} onChange={e => { setSelectedHash(''); demo.selectRound(e.target.value); }}>{data?.rounds.rounds.map(id => <option key={id} value={id}>{id} · {t(id === data.rounds.active ? 'Active' : 'Archived')}</option>)}</select></label><span>{t('Every shipment keeps its own receipts and balances.')}</span></div>}
    <header className="guided-order"><div><span className="eyebrow">{t('ONE ORDER. FIVE CONFIRMED STEPS.')}</span><h1>{t('Goods move. Money follows.')}</h1><p>{t('Watch a real order flow from warehouse receipt to buyer payment.')}</p></div><div className="guided-order-value"><Package size={25}/><span>{t('Order value')}<strong>{data ? `$${money(data.position.orderAmount)}` : '—'}</strong><small>{t(delivered ? '100 units · delivered' : outbound ? '100 units · in transit' : '100 units · ready for shipment')}</small></span></div></header>
    <section className="guided-stage" aria-label={t('Order progress')}>
      <div className="guided-story"><div className="guided-step-label">{complete ? <Check size={18}/> : <span>{['receive','borrow','outbound','deliver','settle'].indexOf(step) + 1} / 5</span>} {t(complete ? 'Order paid and principal settled' : 'Next business event')}</div><h2>{t(complete ? 'The order is paid. The advance is repaid.' : copy.title)}</h2><p>{t(complete ? 'The supplier received {advance} in advance and {proceeds} in remaining order proceeds. This buyer payment repaid {principal} to the funding pool.' : copy.description, figures)}</p>
        <div className="guided-controls">
          {!complete && <div className="guided-mode" aria-label={t('Demo mode')}><button aria-pressed={mode === 'auto'} className={mode === 'auto' ? 'selected' : ''} onClick={() => demo.setMode('auto')}>{t('Automatic')}</button><button aria-pressed={mode === 'step'} className={mode === 'step' ? 'selected' : ''} onClick={() => demo.setMode('step')}>{t('Step by step')}</button></div>}
          {complete ? <button className="primary-button" disabled={busy || !data?.canStartRound || data.archived} onClick={() => { setSelectedHash(''); void demo.startRound(); }}><RotateCcw size={19}/>{t('Try another shipment')}</button> : automatic ? <button className="primary-button" onClick={demo.pause}><Pause size={19}/>{t('Pause after this transaction')}</button> : <button className="primary-button" disabled={disabled} onClick={demo.advance}><Play size={19}/>{pending?.failed ? t('Transaction reverted') : busy ? t('Confirming the original transaction…') : t(mode === 'auto' ? (entries.length ? 'Continue the journey' : 'Start the journey') : copy.action, figures)}</button>}
          <span className="guided-control-note">{t(busy ? 'The submitted transaction will keep confirming, even while paused.' : automatic ? 'Each next step waits for a confirmed receipt.' : mode === 'step' ? 'One click, one business event.' : 'Five real transactions, with time to read each result.')}</span>
        </div>
        {data?.archived && <p className="guided-readonly">{t('Archived round: read-only. Previous debt and receipts are preserved.')} <button onClick={() => demo.selectRound('')}>{t('Return to active round')}</button></p>}
        {data && !data.guidedDemo && <p className="guided-readonly">{t('This environment is read-only. Explore the confirmed evidence below.')}</p>}
        {error && <div className="guided-error" role="alert">{t(error)}{pending && !pending.failed && <button onClick={() => void demo.recover()}>{t('Check original transaction')}</button>}{pending?.failed && pending.hash && <a className="failed-receipt-link" href={explorerUrl ? `${explorerUrl}/tx/${pending.hash}` : `/api/transaction?hash=${pending.hash}`} target="_blank" rel="noreferrer">{t('View reverted transaction')} · {pending.hash.slice(0, 10)}…</a>}</div>}
      </div>
      <div className={`guided-diagram ${busy ? 'is-moving' : ''}`}>
        <div className="goods-lane"><span className={`journey-actor ${received ? 'is-confirmed' : ''}`}><Warehouse size={31}/><strong>{t('Warehouse')}</strong><small>{t(received ? 'Goods confirmed' : 'Goods ready')}</small></span><span className={`journey-route ${outbound ? 'is-confirmed' : ''}`}><Truck size={23}/><span>{t(outbound ? 'Shipped' : 'Awaiting shipment')}</span></span><span className={`journey-actor ${delivered ? 'is-confirmed' : ''}`}><ShoppingBag size={31}/><strong>{t('Buyer')}</strong><small>{t(complete ? 'Paid' : delivered ? 'Received · payment due' : 'Awaiting goods')}</small></span></div>
        <div className="money-lane"><span className={`journey-actor ${borrowed ? 'is-confirmed' : ''}`}><Landmark size={29}/><strong>{t('Funding pool')}</strong><small>{t(complete ? 'Principal recovered' : 'Working capital')}</small></span><span className={`money-route ${borrowed ? 'is-confirmed' : ''}`}><strong>{complete ? '←' : '→'} {complete ? money(settlement?.principal) : borrowed ? money(data?.roundBorrowed) : '50,000'}</strong><small>{t(complete ? 'Advance repaid' : borrowed ? 'Advance received' : 'Supplier advance')}</small></span><span className={`journey-actor ${borrowed ? 'is-confirmed' : ''}`}><Wallet size={29}/><strong>{t('Supplier')}</strong><small>{t(complete ? 'Order proceeds received' : borrowed ? 'Ready for the next order' : 'Needs working capital')}</small></span></div>
        {complete ? <div className="guided-settlement"><span>{t('Buyer payment')}<strong>{money(data?.position.orderAmount)}</strong></span><ArrowRight size={18}/><span>{t('Principal repayment')}<strong>{money(settlement?.principal)}</strong></span><span>+</span><span>{t('Remaining order proceeds')}<strong>{money(data?.position.supplierProceeds)}</strong></span><small>{t('Remaining proceeds are not profit. All amounts in MockUSDC.')}</small></div> : <div className="guided-live-values"><span>{t('Available credit')}<strong>{data ? money(data?.position.availableCredit) : '—'}</strong></span><span>{t('Outstanding debt')}<strong>{data ? money(data?.position.outstandingDebt) : '—'}</strong></span><span>{t('This round received')}<strong>{data ? money(data?.roundBorrowed) : '—'}</strong></span><small>MockUSDC</small></div>}
      </div>
    </section>
    <div className="guided-latest" aria-live="polite"><ShieldCheck size={23}/><div><span>{t(busy ? 'Transaction status' : 'Latest confirmed result')}</span><strong>{busy ? t(state) : latest ? t(({ GOODS_RECEIVED: 'Goods confirmed', BORROW: 'Advance received', GOODS_OUTBOUND: 'Shipped', DELIVERED: 'Buyer signed · awaiting payment', ORDER_SETTLED: 'Buyer paid · principal settled', REPAID: 'Principal repaid' } as Record<string, string>)[latest.eventType] ?? latest.eventType) : t('Shipment registration')}</strong></div><p>{latestSummary}</p></div>
    <section className="live-settlement guided-evidence"><Timeline entries={entries} selectedHash={hash} onSelectHash={setSelectedHash}/><ChainEvidence data={data} busy={busy ? step : ''} submittedHash={pending?.hash ?? ''} selectedHash={hash} onSelectHash={setSelectedHash}/></section>
    <footer className="guided-advanced"><span>{t('Explore the details')}</span><Link href={`/finance${query}`}>{t('Supplier finance')}</Link><Link href={`/erp${query}`}>{t('Warehouse ERP')}</Link><Link href={`/verification${query}${query ? "&" : "?"}from=guide`}>{t('Independent verification')}</Link><Link href="/architecture">{t('How it works')}</Link><Link href="/pitch">{t('Project Pitch')}</Link></footer>
  </div>;
}
export default function Page() { return <Suspense fallback={<div className="page-loading">TradeRail…</div>}><GuidedPage/></Suspense>; }
