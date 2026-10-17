'use client';
import Link from 'next/link';
import { useLocale } from '@/lib/i18n/locale';
import { chain, isLocal } from '@backend/config/chain';
import { ArrowDown, ArrowRight, Code2, Database, Layers3, LockKeyhole, ShieldCheck, Wallet } from 'lucide-react';

export default function Architecture() {
  const { t } = useLocale();
  const layers = [
    { title: 'Warehouse receipt', detail: 'Warehouse, supplier and buyer authorize their own actions. Each confirmed event updates the same order and its financing conditions.', icon: Database },
    { title: 'Event adapter', detail: 'Stable business IDs, validated payloads and authorized warehouse submission.', icon: Code2 },
    { title: 'SupplyChainFinance', detail: 'Receipt, financing, dispatch, buyer acceptance and payment belong to one workflow. Buyer settlement repays principal and allocates the remainder to the supplier.', icon: Layers3 },
    { title: isLocal ? 'Local EVM · Anvil' : chain.name, detail: 'Solidity contracts, Foundry tests and familiar wallets connect business events to token settlement in one execution environment.', icon: ShieldCheck },
    { title: 'Read-only chain evidence', detail: 'Read-only evidence connects each business action to its transaction. The selected deployment and receipts identify what actually ran.', icon: Wallet },
  ];
  return <>
    <div className="page-heading"><div><div className="eyebrow heading-eyebrow">TRADERAIL / {t('Agreed execution')}</div><h1>{t('Executable financing rules')}<span className="title-dot">.</span></h1><p>{t('The goods, the loan and the buyer payment should tell one story.')}</p></div></div>
    <div className="architecture-grid">
      <section className="panel architecture-stack"><h2>{t('The execution path')}</h2>{layers.map((layer, i) => <div className="architecture-layer" key={layer.title}><span><layer.icon size={21} /></span><div><strong>{t(layer.title)}</strong><p>{t(layer.detail)}</p></div>{i < layers.length - 1 && <ArrowDown className="stack-arrow" size={17} />}</div>)}</section>
      <div className="architecture-theses">
        <section className="panel"><ShieldCheck size={23} /><h2>{t('Payment executes the agreed allocation')}</h2><p>{t('Buyer proceeds repay the outstanding principal first. The remaining amount goes directly to the supplier, with a receipt for each movement.')}</p><p>{t('Buyer paid + zero debt = CLOSED')}</p></section>
        <section className="panel"><Wallet size={23} /><h2>{t('Fast feedback. More orders. Familiar tools.')}</h2><p>{t('Independent orders create concurrent financing and settlement activity. Monad’s parallel execution is a foundation for that workload.')}</p><p>{t('Network capabilities inform our selection. Application latency and throughput still require measurement; shared state and signer coordination can limit concurrency.')}</p><a href="https://docs.monad.xyz/introduction/why-monad" target="_blank" rel="noreferrer">{t('Why Monad · official documentation')} ↗</a></section>
        <section className="panel"><LockKeyhole size={23} /><h2>{t('Enterprise privacy')}</h2><p>{t('Customer relationships, unit prices and financing amounts are commercially sensitive.')}</p><p>{t('Keep commercial records encrypted. Share only what each role needs, while committing to the agreed order and terms.')}</p><p>{t('Explore zero-knowledge proofs that an agreed condition is satisfied, without revealing every underlying business field.')}</p><div className="privacy-architecture-note">{t('Future implementation path. Current contracts and values are public; UI masking is only a preview. TACEO Merces is a candidate to evaluate, not an integrated dependency. Its documented limited-access service and testnet demo do not establish support for every workflow above.')}</div></section>
      </div>
    </div>
    <section className="pitch-panel"><span className="eyebrow">{t('ONE PAGE · FIVE BUSINESS STEPS')}</span><h2>{t('One order, from receipt to buyer settlement.')}<br /><span>{t('Less repeated reconciliation. Fewer manual follow-up transfers.')}</span></h2><Link href="/">{t('Start the live demo')}<ArrowRight size={16} /></Link><Link href="/verification">{t('Open chain evidence')}<ArrowRight size={16} /></Link></section>
  </>;
}
