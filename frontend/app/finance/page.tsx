'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowDownLeft, ArrowRight, Check, Eye, LockKeyhole, Wallet } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import { useDemo } from '@/lib/use-demo';
import { money, units } from '@/lib/types';
import { DemoRound } from '@/components/demo-round';
import { ConfirmationResult } from '@/components/confirmation-result';

function Dashboard() {
  const { t, statusLabel, message } = useLocale();
  const { data, error, actionError, connectionError, busy, submittedHash, startRound, selectRound, borrow, repay, transactionState } = useDemo();
  const params = useSearchParams();
  const [privacy, setPrivacy] = useState(params.get('view') === 'private');
  const [repayPart, setRepayPart] = useState('all');
  const p = data?.position;
  const state = p?.status ?? 'NONE';
  const amount = (value?: string) => privacy ? t('PRIVATE') : money(value);
  const blocked = !!busy || !!connectionError || !p || !!data?.archived || privacy;
  const exited = ['OUTBOUND', 'DELIVERED', 'CLOSED'].includes(state);
  const steps = [['Registered', null], ['Received', 'GOODS_RECEIVED'], ['Financed', 'BORROW'], ['Outbound', 'GOODS_OUTBOUND'], ['Delivered', 'DELIVERED']];
  return <div className="finance-workspace">
    <div className="page-heading compact-heading"><div><h1>{t('Financial overview')}</h1><p>{t('Warehouse events set the rules. Suppliers sign the money movement.')}</p></div><Link className="outline-button" href={p ? `/erp?shipmentId=${encodeURIComponent(p.shipmentId)}${privacy ? "&view=private" : ""}` : '/erp'}>{t('Warehouse actions')}<ArrowRight size={16}/></Link></div>
    <DemoRound data={data} busy={busy} startRound={startRound} selectRound={selectRound} readOnly={privacy} />
    <div className="finance-context"><strong>{p?.shipmentId ?? '—'} <span className={`status status-${state.toLowerCase()}`}>{statusLabel(state)}</span></strong><span>{t('Supplier workspace')} · {t('MockUSDC · test token')}</span><button className="outline-button" onClick={() => setPrivacy(!privacy)}>{privacy ? <LockKeyhole size={16}/> : <Eye size={16}/>} {t(privacy ? 'Show financial amounts' : 'Mask amounts')}</button></div>
    <div className="actual-progress">{steps.map(([label,event]) => { const done = event ? !!data?.timeline.some(e => e.eventType === event) : !!data; return <span className={done ? 'done' : ''} key={label}><span>{done ? <Check size={14}/> : '—'}</span>{t(label!)}{event === 'BORROW' && !done && exited && <small>{t('Not occurred')}</small>}</span>; })}</div>
    {privacy && <div className="alert">{t('Values are masked in this UI; the current contracts and API remain public.')} {t('Read-only preview')}</div>}
    {error && <div className="alert error" role="alert">{message(error)}</div>}
    <section className="finance-metrics" aria-label={t('Financial state')}>
      {[['Attested intake value', p?.verifiedInventoryValue, 'USD · historical demo valuation'], ['Available credit', p?.availableCredit, 'MockUSDC · test token'], ['Outstanding debt', p?.outstandingDebt, 'MockUSDC · test token']].map(([label,value,unit]) => <article key={label}><span>{t(label!)}</span><strong>{p ? amount(value) : '—'}</strong><small>{t(unit!)}</small></article>)}
    </section>
    <p className={`finance-reason ${exited ? 'risk-reason' : ''}`}>{exited ? t('Goods have exited: new borrowing is frozen. Outstanding debt remains until repaid.') : state === 'NONE' ? t('Receive goods to activate supplier credit.') : t('Available credit equals 80% of the attested value minus outstanding debt.')}</p>
    <ConfirmationResult data={data} busy={busy} submittedHash={submittedHash} failure={actionError} connectionError={connectionError} from="overview" hidden={privacy} />
    <div className="finance-actions" id="demo-controls">
      <section className="panel finance-action"><h2><Wallet size={20}/>{t('Borrow test tokens')}</h2><p>{t('Supplier signature · direct transfer to supplier wallet')}</p><div className="finance-action-amount">{privacy ? t('PRIVATE') : '50,000'} <small>MockUSDC</small></div><button className="primary-button" disabled={blocked || units(p?.availableCredit) < 50000 || units(data?.poolBalance) < 50000} onClick={() => void borrow()}><ArrowDownLeft size={18}/>{t('Borrow 50,000 MockUSDC')}<ArrowRight size={18}/></button><p>{t('This round received')}: <strong>{amount(data?.roundBorrowed)} MockUSDC</strong></p><small>{t('Supplier wallet · all rounds')}: {amount(data?.supplierBalance)} MockUSDC</small></section>
      <section className="panel finance-action"><h2>{t('Repay principal')}</h2><p>{t('Supplier approves MockUSDC, then signs repayment.')}</p><div className="finance-action-amount">{privacy ? t('PRIVATE') : money(String(BigInt(p?.outstandingDebt ?? '0') / (repayPart === 'half' ? 2n : 1n)))} <small>MockUSDC</small></div><div className="repay-options"><button className={repayPart === 'all' ? 'selected' : ''} onClick={() => setRepayPart('all')}>{t('Full amount')}</button><button className={repayPart === 'half' ? 'selected' : ''} onClick={() => setRepayPart('half')}>{t('Half amount')}</button></div><button className="primary-button" disabled={blocked || units(p?.outstandingDebt) <= 0} onClick={() => void repay(repayPart === 'half' ? String(units(String(BigInt(p?.outstandingDebt ?? '0') / 2n))) : undefined)}>{t('Repay principal')}<ArrowRight size={18}/></button><small>{t('Repayment after outbound never restores borrowing. Buyer payment completes the order.')}</small></section>
    </div>
    {transactionState !== 'idle' && <div className="action-state" role="status">{t('Transaction status')}: <strong>{t(transactionState)}</strong>{submittedHash && <code>{submittedHash}</code>}</div>}
    <div className="finance-boundary"><span>{t('Lender pool liquidity')}: {amount(data?.poolBalance)} MockUSDC</span><p>{t('Prototype: fixed 80% rule, mock tokens, principal only. No interest, liquidation or legally enforced receivables.')}</p></div>
  </div>;
}
export default function DashboardPage() { return <Suspense fallback={<div className="page-loading" role="status">…</div>}><Dashboard /></Suspense>; }
