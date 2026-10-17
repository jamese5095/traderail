'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useLocale } from '@/lib/i18n/locale';
import { ArrowRight, ArrowUpRight, Box, Check, Code2, PackageCheck, Radio, Truck, Warehouse } from 'lucide-react';
import { useDemo } from '@/lib/use-demo';
import { money } from '@/lib/types';
import { WarehouseAuth } from '@/components/warehouse-auth';
import { DemoRound } from '@/components/demo-round';
import { ConfirmationResult, confirmationHref } from '@/components/confirmation-result';

function ERP() {
  const { t, statusLabel, actionLabel, message } = useLocale();
  const { data, error, actionError, connectionError, busy, notice, submittedHash, transactionState, token, setToken, sendEvent, startRound, selectRound } = useDemo();
  const params = useSearchParams();
  const hidden = params.get("view") === "private";
  const p = data?.position;
  const state = p?.status;
  const orderMode = BigInt(p?.orderAmount ?? '0') > 0n;
  
  const actions = [
    { title: t("Receive 100 units"), subtitle: t("Confirm goods received"), kind: 'GOODS_RECEIVED' as const, icon: Box, enabled: state === 'NONE', detail: t("Create $100,000 of verified inventory and $80,000 of borrowing power.") },
    { title: t("Ship Goods"), subtitle: t("Confirm goods outbound"), kind: 'GOODS_OUTBOUND' as const, icon: Truck, enabled: ['RECEIVED', 'COLLATERALIZED'].includes(state ?? ''), detail: t("Inventory exits the warehouse. Freeze new borrowing and retain debt.") },
    { title: t("Confirm Delivery"), subtitle: t("Recognize delivery"), kind: 'DELIVERED' as const, icon: PackageCheck, enabled: state === 'OUTBOUND', detail: t("The buyer signs for delivery. Buyer payment settles the order.") }
  ].filter(action => !orderMode || action.kind !== 'DELIVERED');
  const payload = { eventType: 'GOODS_RECEIVED', shipmentId: p?.shipmentId ?? 'SHIP-001', sku: 'SKU-001', quantity: 100, declaredValue: 100000 };
  return <>
    <div className="page-heading compact-heading"><div><h1>{t("Warehouse ERP")}<span className="title-dot">.</span></h1><p>{t("A small WMS simulator. A real financial consequence.")}</p></div><Link className="outline-button" href={p ? `/finance?shipmentId=${encodeURIComponent(p.shipmentId)}${hidden ? "&view=private" : ""}` : '/finance'}>{t("View dashboard")}<ArrowUpRight size={15} /></Link></div>
    <DemoRound readOnly={hidden} data={data} busy={busy} startRound={startRound} selectRound={selectRound} />
    {hidden && <div className="alert">{t("Read-only preview")}</div>}
    {error && <div className="alert error" role="alert">{message(error)}</div>}{notice && !error && <div className="alert success" role="status"><Check size={14} />{message(notice)}</div>}
    <ConfirmationResult data={data} busy={busy} submittedHash={submittedHash} failure={actionError} connectionError={connectionError} from="erp" hidden={hidden} />
    <div className="demo-controls-heading" id="demo-controls"><h2>{t("Demo controls")}</h2><Link href={data ? confirmationHref(data, 'erp', hidden) : '/verification'}>{t("Events & onchain verification")}<ArrowUpRight size={15} /></Link></div>
    <div className="erp-system-bar"><span className="erp-system-icon"><Warehouse size={26} /></span><div><strong>{t("Shanghai Demo Warehouse")}</strong><p>{t("Warehouse management system · Demo environment")}</p></div><span className="live-badge"><Radio size={13} />{data && !connectionError ? t("Protocol connected") : t("Connecting…")}</span></div>
    <div className="erp-grid operations-workspace"><div><section className="panel erp-shipment"><div className="panel-heading"><h2>{t("Shipment work order")}</h2><span className={`status status-${state?.toLowerCase()}`}>{state ? statusLabel(state) : t('CONNECTING')}</span></div><div className="work-order"><div><small>{t("SHIPMENT")}</small><strong>{p?.shipmentId ?? '—'}</strong></div><div><small>{t("PRODUCT")}</small><strong>SKU-001</strong></div><div><small>{t("EXPECTED QUANTITY")}</small><strong>{t("100 units")}</strong></div><div><small>{t("DECLARED VALUE")}</small><strong>$100,000</strong></div></div><WarehouseAuth required={!data?.demoSigner} token={token} setToken={setToken} /></section>
      <div className="erp-action-cards">{actions.map((action, i) => <section className="panel erp-action" key={action.kind}><span className="erp-action-number">0{i + 1}</span><span className="erp-action-icon"><action.icon size={25} /></span><div><span className="eyebrow">{action.subtitle}</span><h2>{action.title}</h2><p>{action.detail}</p>{!action.enabled && <small className="operation-unavailable">{t("Unavailable in the current shipment state")}</small>}</div><button className="primary-button" onClick={() => void sendEvent(action.kind)} disabled={hidden || !!busy || !!connectionError || !!data?.archived || !action.enabled} title={!action.enabled ? t("Unavailable in the current shipment state") : undefined}>{busy === action.kind.replaceAll('_', ' ') ? t("Confirming…") : action.title}<ArrowRight size={14} /></button></section>)}</div>
      {orderMode && <section className="panel erp-action"><span className="erp-action-icon"><PackageCheck size={25}/></span><div><h2>{t("Buyer receipt and payment")}</h2><p>{t("The buyer signs for delivery. Buyer payment settles the order.")}</p></div><Link className="outline-button" href={p ? `/?shipmentId=${encodeURIComponent(p.shipmentId)}` : '/'}>{t("Open order journey")}<ArrowRight size={14}/></Link></section>}
      {transactionState !== "idle" && <div className="action-state" role="status">{t("Transaction status")}: <strong>{t(transactionState)}</strong>{submittedHash && <code>{submittedHash}</code>}</div>}
     
      <details className="panel event-payload"><summary>{t("Normalized event input")}</summary><div className="panel-heading"><h2><Code2 size={17} />{t("Normalized event input")}</h2><span className="mini-label">REST API</span></div><div className="code-title"><span className="method-badge">POST</span>/api/events</div><pre>{JSON.stringify(payload, null, 2)}</pre><p>{t("A stable eventId is reused for retries. The same request returns its original result; conflicting payloads are rejected.")}</p></details>
    </div><aside><section className="panel erp-result"><span className="eyebrow">{t("LIVE PROTOCOL RESPONSE")}</span><h2>{t("Financial consequences")}</h2><dl className="state-list"><div><dt>{t("Attested intake value")}</dt><dd>{p ? '$' + money(p.verifiedInventoryValue) : '—'}</dd></div><div><dt>{t("Borrowing power")}</dt><dd>{p ? '$' + money(p.borrowingPower) : '—'}</dd></div><div><dt>{t("Outstanding debt")}</dt><dd>{p ? '$' + money(p.outstandingDebt) : '—'}</dd></div></dl><Link className="erp-dashboard-link" href={p ? `/finance?shipmentId=${encodeURIComponent(p.shipmentId)}${hidden ? "&view=private" : ""}` : '/finance'}>{t("Continue as Supplier")}<ArrowUpRight size={15} /></Link></section></aside></div>
  </>;
}

export default function ERPPage() { return <Suspense fallback={<div className="page-loading" role="status">…</div>}><ERP /></Suspense>; }
