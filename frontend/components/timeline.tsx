'use client';
import { ArrowDownLeft, Check, ExternalLink, PackageCheck, Truck, Warehouse, ArrowRight } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import { explorerUrl } from '@backend/config/chain';
import { money, shortAddress, type TimelineEntry } from '@/lib/types';

const labels: Record<string, string> = { ORDER_SETTLED: 'Buyer paid · principal settled', REPAID: 'Principal repaid', GOODS_RECEIVED: 'Goods received', BORROW: 'Stablecoin borrowed', GOODS_OUTBOUND: 'Goods outbound', DELIVERED: 'Delivery confirmed', INSPECTION_PASSED: 'Inspection passed' };
export function Timeline({ entries, hidden = false, selectedHash, onSelectHash }: { entries: TimelineEntry[]; hidden?: boolean; selectedHash: string; onSelectHash: (hash: string) => void }) {
  const { t, locale } = useLocale();
  const value = (v: string) => hidden ? t("PRIVATE") : '$' + money(v);
  return <section className="panel timeline-panel"><div className="panel-heading"><h2>{t("Event timeline")}</h2><span className="count-badge">{entries.length}</span></div><p className="panel-subtitle">{t("Every event has a financial consequence.")}</p>
    {entries.length === 0 ? <div className="empty-timeline"><Warehouse size={28} /><strong>{t("Ready for the first event")}</strong><p>{t("Confirm inventory in the warehouse to create borrowing power.")}</p><span className="empty-line" /></div> : <ol className="timeline">
      {entries.map((entry, i) => {
        const Icon = entry.eventType === 'BORROW' ? ArrowDownLeft : entry.eventType === 'GOODS_OUTBOUND' ? Truck : entry.eventType === 'DELIVERED' ? PackageCheck : Warehouse;
        return <li className={selectedHash === entry.hash ? 'selected-event' : ''} key={entry.hash + i}><span className={`timeline-icon ${entry.eventType === 'BORROW' ? 'purple' : ''}`}><Icon size={20} /></span><div className="timeline-content">
          <div className="timeline-title"><strong>{t(labels[entry.eventType] ?? entry.eventType)}</strong><time>{new Date(entry.timestamp * 1000).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })} UTC+8</time></div>
          <p>{entry.eventType === 'GOODS_RECEIVED' ? t('Credit created · {amount}', { amount: value(entry.after.power) }) : entry.eventType === 'BORROW' ? t('Supplier USDC +{amount}', { amount: hidden ? t('PRIVATE') : money(entry.amount) }) : entry.eventType === 'REPAID' ? t('Principal repaid: {amount}', { amount: value(entry.amount) }) : entry.eventType === 'GOODS_OUTBOUND' ? t('Borrowing power → {amount}', { amount: value('0') }) : entry.eventType === 'ORDER_SETTLED' ? t('Buyer payment · {amount}', { amount: value(entry.amount) }) : entry.eventType === 'DELIVERED' ? t('Buyer signed · awaiting payment') : t("Warehouse attestation confirmed")}</p>
          <span className="event-confirmation"><Check size={13} />{t('Confirmed · Block {block}', { block: entry.block })}</span>
          <button className="event-proof-button" aria-pressed={selectedHash === entry.hash} onClick={() => onSelectHash(entry.hash)}><code>{shortAddress(entry.hash)}</code><span>{t('Verify this event')}<ArrowRight size={13} /></span></button>
          {explorerUrl && <a className="event-explorer" href={`${explorerUrl}/tx/${entry.hash}`} target="_blank" rel="noreferrer">{t("View transaction")} <ExternalLink size={12} /></a>}
        </div></li>;
      })}
    </ol>}
    <div className="timeline-footnote"><span className="network-dot" />{t("Read from confirmed contract events")}</div>
  </section>;
}
