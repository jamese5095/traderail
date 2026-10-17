'use client';
import { ArrowDown, ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import { money, type TimelineEntry } from '@/lib/types';

export function Transition({ entry, hidden = false }: { entry?: TimelineEntry; hidden?: boolean }) {
  const { t, eventLabel } = useLocale();
  const value = (v: string) => hidden ? t("PRIVATE") : '$' + money(v);
  let changes: [string, string, string][] = [];
  if (entry?.eventType === 'GOODS_RECEIVED') changes = [[t("Inventory collateral"), value(entry.before.inventory), value(entry.after.inventory)], [t("Borrowing power"), value(entry.before.power), value(entry.after.power)]];
  if (entry?.eventType === 'BORROW') changes = [[t("Outstanding debt"), value(entry.before.debt), value(entry.after.debt)], [t("Supplier USDC movement"), hidden ? t("PRIVATE") : '+$0', hidden ? t("PRIVATE") : '+$' + money(entry.amount)]];
  if (entry?.eventType === 'REPAID') changes = [[t('Outstanding debt'), value(entry.before.debt), value(entry.after.debt)], [t('Principal repaid'), value('0'), value(entry.amount)]];
  if (entry?.eventType === 'GOODS_OUTBOUND') changes = [[t("Borrowing power"), value(entry.before.power), value(entry.after.power)], [t("Debt retained"), value(entry.before.debt), value(entry.after.debt)]];
  if (entry?.eventType === 'DELIVERED') changes = [[t("Order status"), t("Shipped"), t("Buyer signed · awaiting payment")], [t("Outstanding debt"), value(entry.before.debt), value(entry.after.debt)]];
  if (entry?.eventType === 'INSPECTION_PASSED') changes = [[t("Attestation"), t("Received"), t("Inspection passed")], [t("Borrowing power"), value(entry.before.power), value(entry.after.power)]];
  return <section className={`transition-panel ${entry ? 'has-event' : ''}`} key={entry?.hash ?? 'waiting'}>
    <div className="transition-title"><span><Zap size={15} />{entry?.eventType === 'BORROW' ? t("Settlement → money movement") : t("Physical event → financial state")}</span><span className="eyebrow">{entry ? t("LATEST TRANSITION") : t("EVENT DRIVEN")}</span></div>
    <div className="transition-content"><div className="transition-source"><span className="event-check">{entry ? <CheckCircle2 size={19} /> : <span className="network-dot" />}</span><div><strong>{entry ? eventLabel(entry.eventType) : t("WAITING FOR INVENTORY")}</strong><small>{entry ? t("Verified & settled onchain") : t("Send a trusted warehouse event")}</small></div></div><ArrowRight size={19} className="transition-arrow" />
      <div className="transition-changes">{changes.length ? changes.map(([label, from, to]) => <div className="change-row" key={label}><span>{label}</span><div><span className="before-value">{from}</span><ArrowRight size={13} /><strong>{to}</strong></div></div>) : <div className="waiting-change"><span>{t("Verified inventory")}</span><ArrowDown size={14} /><strong>{t("Programmable credit")}</strong></div>}</div>
    </div>
  </section>;
}
