'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Boxes, Grid2X2, Pause, Play, Presentation, ScanLine, ShieldCheck, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale';
import styles from './pitch.module.css';

const chapters = ["Project positioning", "Digital trade records", "Settlement bottlenecks", "Enterprise to Monad", "Why Monad", "Enterprise private settlement", "Commercial adoption and next steps"];
const headlines = ["A trade settlement and financing protocol on Monad.", "Trade fulfilment already leaves digital records.", "Working-capital bottlenecks in cross-border supply chains", "Keep business control. Connect the money.", "Let settlement keep pace with trade.", "Private settlement for enterprises", "A settlement service for real business."];
const fromHash = () => {
  const match = window.location.hash.match(/^#page-(\d+)$/);
  const requested = match ? Number(match[1]) : 0;
  return requested >= 1 && requested <= chapters.length ? requested - 1 : 0;
};

export function PitchDeck({published=false,assetBase='',networkName='Monad Testnet'}:{published?:boolean;assetBase?:string;networkName?:string}) {
  const { t: translate, locale, setLocale, ready, hasPreference } = useLocale();
  const brand = published ? '贸脉 TradeRail' : 'TradeRail';
  const t = useCallback((text: string) => {
    const translated = translate(text);
    return published ? translated.replaceAll('TradeRail', brand) : translated;
  }, [translate, published, brand]);
  const [page, setPage] = useState(0);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [staticMode, setStaticMode] = useState(false);
  const [mobile, setMobile] = useState(false);
  const slides = useRef<(HTMLElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const overviewButton = useRef<HTMLButtonElement>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const mobileScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileNavigating = useRef(false);

  useEffect(() => { if (ready && !hasPreference) setLocale('zh'); }, [ready, hasPreference, setLocale]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const restore = () => {
      const current = fromHash(); setPage(current);
      if (window.matchMedia('(max-width: 767px)').matches && window.location.hash) slides.current[current]?.scrollIntoView({ behavior: 'instant', block: 'start' });
    };
    restore();
    window.addEventListener('hashchange', restore); window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('hashchange', restore); window.removeEventListener('popstate', restore); };
  }, []);
  useEffect(() => {
    document.title = `${brand} · ${t('Project Pitch')}`;
  }, [t, brand]);

  const navigate = useCallback((next: number) => {
    const current = Math.max(0, Math.min(chapters.length - 1, next));
    setPage(current); setOverview(false);
    if (window.location.hash !== `#page-${current + 1}`) window.history.pushState(null, '', `#page-${current + 1}`);
    if (mobile) {
      mobileNavigating.current = true;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      slides.current[current]?.scrollIntoView({ behavior: staticMode || reduced ? 'instant' : 'smooth', block: 'start' });
      if (mobileScrollTimer.current) clearTimeout(mobileScrollTimer.current);
      mobileScrollTimer.current = setTimeout(() => { mobileNavigating.current = false; }, 1000);
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && slides.current.some((slide, index) => index !== current && slide?.contains(active))) active.blur();
  }, [mobile, staticMode]);

  useEffect(() => {
    if (!mobile) return;
    let frame = 0;
    const update = () => {
      if (mobileNavigating.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const probe = window.innerHeight * .3;
        const visible = slides.current.findIndex(slide => {
          const rect = slide?.getBoundingClientRect();
          return rect && rect.top <= probe && rect.bottom > probe;
        });
        if (visible >= 0) {
          setPage(visible);
          window.history.replaceState(null, '', `#page-${visible + 1}`);
        }
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('scroll', update); cancelAnimationFrame(frame); };
  }, [mobile]);
  useEffect(() => () => { if (mobileScrollTimer.current) clearTimeout(mobileScrollTimer.current); }, []);
  useEffect(() => {
    if (overview) dialog.current?.showModal();
    else if (dialog.current?.open) { dialog.current.close(); overviewButton.current?.focus(); }
  }, [overview]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); setOverview(value => !value); return; }
      if (overview) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); navigate(page + (event.key === 'ArrowRight' ? 1 : -1)); }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); setPresenting(value => !value); }
      if (event.key.toLowerCase() === 'b') { event.preventDefault(); setStaticMode(value => !value); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [page, overview, navigate]);

  const demoHref=published?'https://github.com/jamese5095/traderail#本地运行':'/';
  const demoLabel=published?'Run the demo':'Enter the live demo';
  const DemoLinks = () => <div className={styles.actions}>
    <Link className={styles.primary} href={demoHref}>{t(demoLabel)}<ArrowUpRight size={17} /></Link>
    <Link className={styles.textLink} href={published?'https://github.com/jamese5095/traderail#部署与独立核验':'/?evidence=1'}>{t(published?'View the source':'Open chain evidence')}<ArrowUpRight size={15} /></Link>
  </div>;
  const Flow = ({ items, label, raw = false }: { items: string[]; label?: string; raw?: boolean }) => <div className={styles.flow} aria-label={label}>{items.map((item, index) => <div className={styles.flowItem} key={item}><span>{raw ? item : t(item)}</span>{index < items.length - 1 && <ArrowRight size={18} aria-hidden="true" />}</div>)}</div>;
  const Note = ({ children }: { children: ReactNode }) => <p className={styles.note}>{children}</p>;

  const content = (index: number) => {
    switch (index) {
      case 0: return <>
        <div className={styles.caseIntro}><span className={styles.kicker}>{t("CROSS-BORDER SUPPLY CHAINS · PROGRAMMABLE SETTLEMENT")}</span><h1 className={styles.caseWordmark}>{published && <span className={styles.chineseWordmark}>贸脉</span>}TradeRail<span>.</span></h1><h2>{t(headlines[0])}</h2></div>
        <p className={styles.positioning}>{t("Bring existing supply chain finance settlement onto Monad.")}</p>
        <div className={styles.painGrid}><div className={styles.editorialBlock}><span className={styles.index}>{t("01 / Physical flow")}</span><h3>{t("Goods already leave a record")}</h3><p>{t("Scanning, warehouse and delivery events enter enterprise systems, making order progress traceable.")}</p></div><div className={styles.editorialBlock}><span className={styles.index}>{t("02 / Capital flow")}</span><h3>{t("Capital still has to wait")}</h3><p>{t("Loans, payments and receipt checks cross multiple systems, leaving a gap between business progress and usable funds.")}</p></div><div className={styles.editorialBlock}><span className={styles.index}>{t("03 / TradeRail")}</span><h3>{t("Connect business to settlement")}</h3><p>{t("Turn authorized business events into executable fund instructions, with allocation and confirmed receipt sync.")}</p></div></div>
        <div className={styles.actions}><button className={styles.primary} onClick={() => navigate(1)}>{t("Start with the business records")}<ArrowRight size={17}/></button><Link className={styles.textLink} href={demoHref}>{t(demoLabel)}<ArrowUpRight size={17}/></Link></div>
        <Note>{t("The demo verifies two-party payment and optional three-party financing with real test-chain transfers. Enterprise events come from a mock ERP.")}</Note>
      </>;
      case 1: return <>
        <div className={styles.heading}><span className={styles.kicker}>{t("BEFORE SETTLEMENT · TRUSTED BUSINESS DATA")}</span><h2>{t(headlines[1])}</h2><p className={styles.backgroundSubtitle}>{t("Warehouse scans and delivery events can feed ERP or consortium records.")}</p></div>
        <div className={styles.backgroundGrid}>
          <section className={styles.backgroundPanel}><span className={styles.index}>{t("01 / Physical operations")}</span><h3>{t("Capture the warehouse event")}</h3><figure className={styles.warehouseFigure}><img src={`${assetBase}/images/warehouse-scanning.jpg`} width="600" height="600" alt={t("A warehouse worker scans a goods label with a Zebra handheld terminal.")} loading="eager"/><figcaption><span>{t("Warehouse barcode capture")}</span><a href="https://www.waveform.com/products/zebra-mc9450" target="_blank" rel="noreferrer">{t("Photo: Waveform / Zebra")}<ArrowUpRight size={11}/></a></figcaption></figure><div className={styles.warehouseEvents}><span>{t("Receiving")}</span><ArrowRight size={13}/><span>{t("Dispatch")}</span><ArrowRight size={13}/><span>{t("Delivery")}</span></div></section>
          <section className={styles.backgroundPanel}><span className={styles.index}>{t("02 / Business records")}</span><h3>{t("An order-linked record")}</h3><div className={styles.businessRecord}><div className={styles.recordTitle}><ScanLine size={19}/><span>{t("ILLUSTRATIVE DELIVERY RECORD")}</span></div><strong>POD-DEMO-001</strong><dl><div><dt>{t("Order reference")}</dt><dd>DEMO-001</dd></div><div><dt>{t("Goods / quantity")}</dt><dd>{t("Industrial sensors × 100")}</dd></div><div><dt>{t("Recorded status")}</dt><dd className={styles.recordStatus}>{t("Delivery recorded")}</dd></div><div><dt>{t("Business source")}</dt><dd>{t("Warehouse service / ERP")}</dd></div></dl><p><ShieldCheck size={14}/>{t("Link the order. Verify the source.")}</p></div><p className={styles.backgroundCaption}>{t("Illustrative record · fields used in the demo.")}</p></section>
          <section className={styles.backgroundPanel}><span className={styles.index}>{t("03 / Authorized execution")}</span><h3>{t("An authorized trigger")}</h3><div className={styles.triggerPath}><div className={styles.adapterNode}><span>{t("BUSINESS ADAPTER")}</span><strong>{t("Authorized instruction")}</strong><p>{t("Bind the order, event and agreed terms.")}</p></div><ArrowRight size={20} className={styles.triggerArrow} aria-hidden="true"/><div className={styles.settlementNode}><span>◈</span><div><strong>{brand}</strong><small>{t("Check terms and permissions. Settle on Monad.")}</small></div></div></div><p className={styles.backgroundCaption}>{t("Parties agree payment terms and permissions.")}</p></section>
        </div>
        <div className={styles.ruleStrip}><strong>{t("Connect verified business events to authorized settlement.")}</strong></div>
        <div className={styles.backgroundBottom}><Note>{t("Demo premise: a trusted provider verifies the goods. Warehouse records are simulated; production data integration remains to be built.")}</Note><button className={styles.textLink} onClick={() => navigate(2)}>{t("Now look at the settlement gap")}<ArrowRight size={16}/></button></div>
      </>;
      case 2: return <>
        <div className={styles.heading}><span className={styles.kicker}>{t("THE SETTLEMENT GAP · CROSS-BORDER TRADE")}</span><h2>{t(headlines[2])}</h2><p className={styles.painSubtitle}>{t("Business information is already digital. Transfers, funds availability and reconciliation still require multiple handoffs.")}</p></div>
        <div className={styles.settlementLayers}>
          <div className={styles.settlementLane}><span>{t("Digital business records")}</span><Flow items={["Scanning / warehouse checks", "ERP / consortium ledger", "Business conditions recorded"]}/></div>
          <div className={styles.settlementHandoff}><span aria-hidden="true">↓</span><p>{t("Goods and business progress are recorded. Funds still need execution, confirmation and reconciliation.")}</p><span aria-hidden="true">↓</span></div>
          <div className={styles.settlementLane}><span>{t("Funds and receipts")}</span><Flow items={["Lender / buyer payment", "Payment processing", "Funds available", "Repayment and record sync"]}/></div>
        </div>
        <div className={styles.painGrid}>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("01 / Waiting")}</span><h3>{t("Uncertain funds availability")}</h3><p>{t("Time zones, banking hours, checks and posting delay usable funds. Approved loans or paid invoices may not yet fund the next order.")}</p></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("02 / Costs")}</span><h3>{t("Costs across multiple stages")}</h3><p>{t("Transfer fees, intermediary charges and FX spreads accumulate separately. Total cost and net proceeds can be difficult to predict.")}</p></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("03 / Turnover")}</span><h3>{t("Records move ahead of capital")}</h3><p>{t("Beyond agreed payment terms, payment instructions, receipt checks and repayment allocation can delay the next funding cycle.")}</p></div>
        </div>
        <div className={styles.painResponse}><p>{t("TradeRail connects approved payables, financier offers and programmable settlement, letting suppliers receive cash before buyer maturity.")}</p><button className={styles.textLink} onClick={() => navigate(3)}>{t("See the architecture")}<ArrowRight size={16}/></button></div>
        <Note>{t("Delays vary by trade corridor. Bank receipt differs from usable funds. Commercial payment terms remain agreed between parties.")} <a href="https://www.swift.com/payments/how-long-does-swift-payment-take" target="_blank" rel="noreferrer">{t("Source: Swift payment journey")}</a></Note>
      </>;
      case 3: return <>
        <div className={styles.heading}><span className={styles.kicker}>{t("TARGET ARCHITECTURE · CLEAR RESPONSIBILITIES")}</span><h2>{t(headlines[3])}</h2></div>
        <div className={styles.threeColumns}><div className={styles.editorialBlock}><span className={styles.index}>{t("01 / Enterprise")}</span><h3>{t("Goods verification stays with enterprises")}</h3><p>{t("ERP and consortium ledgers are alternative sources. An adapter turns trusted records into authorized settlement instructions.")}</p></div><div className={styles.editorialBlock}><span className={styles.index}>{t("02 / Authorization")}</span><h3>{t("A verifiable settlement instruction")}</h3><p>{t("Bind the business event to its order, parties, approved amount and expiry. Reject altered or repeated instructions.")}</p></div><div className={styles.editorialBlock}><span className={styles.index}>{t("03 / Monad")}</span><h3>{t("Execute and return a receipt")}</h3><p>{t("Direct payment goes to the supplier. Reverse factoring pays the purchase price and updates the payment recipient atomically.")}</p></div></div>
        <div className={styles.ruleStrip}><strong>{t("Two parties settle a trade. A third party supplies optional financing.")}</strong></div>
        <div className={styles.businessLanes}><div><span>{t("2 PARTIES / TRADE PAYMENT")}</span><Flow items={["Goods shipped", "Buyer accepts goods", "Authorized buyer payment", "Supplier receives payment"]}/></div><div><span>{t("3 PARTIES / REVERSE FACTORING")}</span><Flow items={["Buyer approves payable", "Supplier receives early payment", "Buyer pays at maturity", "Financier receives maturity proceeds"]}/></div></div><div className={styles.actions}><Link className={styles.textLink} href={demoHref}>{t(published?'Run the demo':'Follow the full order in the demo')}<ArrowUpRight size={15}/></Link></div>
        <Note>{t("Premises: a trusted provider verifies goods; all parties authorize dollar-stablecoin settlement. Signatures prove authorization, not goods accuracy or guaranteed repayment.")}</Note>
      </>;
      case 4: return <>
        <div className={styles.heading}><span className={styles.kicker}>WHY MONAD</span><h2>{t(headlines[4])}</h2><p className={styles.monadIntro}>{t("From a confirmed order to continuous settlement across enterprises.")}</p></div>
        <div className={styles.threeColumns}>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("01 / Fast confirmation")}</span><h3>{t("Confirm the payment. Continue the business.")}</h3><p>{t("After an authorized payment, fast on-chain confirmation gives suppliers, buyers and financiers a shared, verifiable result to act on.")}</p><span className={styles.monadStage}>{t("IN THE DEMO / Confirmed transfers and receipts")}</span></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("02 / Parallel execution")}</span><h3>{t("Serve orders across enterprises")}</h3><p>{t("Trade creates a continuous flow of independent orders. Monad’s parallel execution provides a foundation for processing their payment and financing transactions concurrently.")}</p><span className={styles.monadStage}>{t("AT SCALE / Independent order workflows")}</span></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("03 / Programmable settlement")}</span><h3>{t("Settle at finer business milestones")}</h3><p>{t("Combine fast confirmation with EVM rules to support agreed payment milestones: partial delivery, staged payments and automatic allocation of proceeds.")}</p><span className={styles.monadStage}>{t("FUTURE / Partial and staged settlement")}</span></div>
        </div>
        <div className={styles.ruleStrip}><strong>{t("When agreed business conditions are met, funds move by the rules.")}</strong></div>
        <Note>{t("The demo verifies order-level settlement. Concurrent workloads and partial settlement remain to be implemented and validated; payment terms still follow the parties’ agreement.")}</Note>
        <div className={styles.actions}><a className={styles.textLink} href="https://docs.monad.xyz/introduction/why-monad" target="_blank" rel="noreferrer">{t('Why Monad · official documentation')}<ArrowUpRight size={15}/></a><a className={styles.textLink} href="https://docs.monad.xyz/monad-arch/execution/parallel-execution" target="_blank" rel="noreferrer">{t('Parallel execution')}<ArrowUpRight size={15}/></a></div>
      </>;
      case 5: return <>
        <div className={styles.heading}><span className={styles.kicker}>{t("CATEGORY LABS · MONAD PRIVATE SETTLEMENT · FUTURE INTEGRATION")}</span><h2>{t(headlines[5])}</h2><p className={styles.privacyIntro}>{t("Protect commercial information while connecting to an open capital network.")}</p></div>
        <div className={styles.privacyDiagram} role="group" aria-label={t("TradeRail proposed private settlement architecture")}>
          <div className={styles.privacyNode}><span>{t("BUSINESS RECORDS")}</span><strong>{t("ERP / consortium ledger")}</strong><small>{t("Goods, orders and approvals")}</small></div>
          <ArrowRight className={styles.diagramArrow} size={20} aria-hidden="true"/>
          <div className={styles.privacyNode}><span>{t("AUTHORIZATION")}</span><strong>{t("TradeRail interface")}</strong><small>{t("Bound business instructions")}</small></div>
          <ArrowRight className={styles.diagramArrow} size={20} aria-hidden="true"/>
          <div className={`${styles.privacyNode} ${styles.privateDomain}`}><span>{t("PROPOSED CONFIDENTIAL DOMAIN")}</span><strong>{t("Private settlement")}</strong><small>{t("Loan terms, allocations and receipts")}</small></div>
          <span className={styles.diagramArrow} aria-hidden="true">↔</span>
          <div className={styles.privacyNode}><span>MONAD</span><strong>{t("Public liquidity")}</strong><small>{t("Permitted assets and atomic settlement")}</small></div>
        </div>
        <div className={styles.accessPolicy}><span>{t("Scoped access")}</span><strong>{t("Counterparties · Lenders · Authorized auditors")}</strong><small>{t("Each role sees the information it needs.")}</small></div>
        <div className={styles.threeColumns}>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("01 / Relationships")}</span><h3>{t("Protect the trading network")}</h3><p>{t("Keep order-party links confidential, reducing exposure of customer and supplier relationships through payment records.")}</p></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("02 / Financing")}</span><h3>{t("Protect negotiated terms")}</h3><p>{t("Restrict access to invoice values, purchase prices and negotiated terms, so financiers can provide differentiated offers.")}</p></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("03 / Accountability")}</span><h3>{t("Support authorized review")}</h3><p>{t("Give counterparties, lenders and auditors scoped access to relevant records, supporting institutional collaboration.")}</p></div>
        </div>
        <Note>{t("Private Settlement is a published design, not yet live. This is TradeRail’s proposed application; current demo addresses and amounts are public.")} <a href="https://monad.xyz/blog/monad-private-settlement" target="_blank" rel="noreferrer">{t("Category Labs design · official overview")}<ArrowUpRight size={12}/></a></Note>
      </>;
      default: return <>
        <div className={styles.heading}><span className={styles.kicker}>{t("COMMERCIAL ADOPTION · DELIVERY ROADMAP")}</span><h2>{t(headlines[6])}</h2></div>
        <div className={styles.threeColumns}>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("01 / Customers")}</span><h3>{t("Platforms and institutions")}</h3><p>{t("Serve supply-chain platforms, lenders and corporate finance teams connecting approved business to cross-border settlement.")}</p></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("02 / Service")}</span><h3>{t("Execution and reconciliation")}</h3><p>{t("Provide authorization, settlement orchestration and receipt reconciliation. Institutions supply capital and make credit decisions.")}</p></div>
          <div className={styles.editorialBlock}><span className={styles.index}>{t("03 / Revenue hypothesis")}</span><h3>{t("Subscription and usage fees")}</h3><p>{t("Explore enterprise integration subscriptions and per-settlement service fees. Validate pricing and demand through pilots.")}</p></div>
        </div>
        <ol className={styles.deliveryRoadmap} aria-label={t("Delivery roadmap")}>
          <li><span>{t("TODAY / VERIFIED")}</span><strong>{t("Public test-token settlement")}</strong><p>{t("Direct payment and reverse factoring: delivery commitments, buyer approval, financier quotes, atomic purchase and verifiable receipts.")}</p></li>
          <li><span>{t("NEXT / TO BUILD")}</span><strong>{t("Production enterprise integration")}</strong><p>{t("Connect real ERP or consortium adapters; validate custody, payment terms, receivable rights and institutional controls.")}</p></li>
          <li><span>{t("FUTURE / TO VALIDATE")}</span><strong>{t("Confidential collaboration")}</strong><p>{t("Evaluate Private Settlement integration, permissions and audit access when available.")}</p></li>
        </ol>
        <DemoLinks/><Note>{t("Lenders retain credit risk. Production enterprise integration and private settlement are future work; savings and commercial demand require pilot validation.")}</Note>
      </>;
    }
  };

  return <main className={`${styles.deck} ${staticMode ? styles.static : ''} ${presenting ? styles.presenting : ''}`} data-page={page + 1} data-static={staticMode} data-presenting={presenting}>
    <div className={styles.languages} role="group" aria-label={t('Switch language')}><button aria-label="切换为中文" aria-pressed={locale === 'zh'} lang="zh-CN" onClick={() => setLocale('zh')}>中文</button><span>/</span><button aria-label="Switch to English" aria-pressed={locale === 'en'} lang="en" onClick={() => setLocale('en')}>EN</button></div>
    {presenting && <button className={styles.exitPresentation} onClick={() => setPresenting(false)}><X size={14} />{t('Exit presentation')}</button>}
    <div className={styles.viewport} onTouchStart={event => { if (!(event.target as HTMLElement).closest('button, a')) touchOrigin.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => {
      const start = touchOrigin.current; touchOrigin.current = null;
      if (!mobile && start && event.changedTouches.length) { const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(page + (dx < 0 ? 1 : -1)); }
    }}>
      <div className={styles.track} style={{ transform: mobile ? undefined : `translateX(-${page * 100}%)` }}>
        {chapters.map((chapter, index) => <article key={chapter} id={`pitch-page-${index + 1}`} className={`${styles.slide} ${index === 0 ? styles.coverSlide : index === 1 ? styles.backgroundSlide : index === 2 ? styles.painSlide : index === 3 ? styles.architectureSlide : index === 4 ? styles.monadSlide : index === 5 ? styles.privacySlide : index === 6 ? styles.commercialSlide : ''}`} aria-label={`${t('Page')} ${index + 1}: ${t(chapter)}`} aria-hidden={!mobile && page !== index ? true : undefined} inert={!mobile && page !== index} ref={element => { slides.current[index] = element; }}>
          <header className={styles.slideHeader}><Link href={demoHref} aria-label={t(published?'View the source':'Open live demo')}><Boxes size={17} /><span>{published ? '贸脉 TRADERAIL' : 'TRADERAIL'} <span className={styles.metaDivider}>/</span> {published?'MONAD · OPEN SOURCE':networkName}</span></Link><span>{String(index + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')} <span className={styles.metaDivider}>·</span> {t(chapter)}</span></header>
          <div className={styles.content}>{content(index)}</div>
          <footer className={styles.slideFooter}><span>{t('Business recorded. Settlement verified.')}</span><span>{index === 0 ? t('Hackathon Pitch') : t(chapter)}</span></footer>
        </article>)}
      </div>
    </div>
    <nav className={styles.navigation} aria-label={t('Presentation navigation')}><button aria-label={t('Previous page')} onClick={() => navigate(page - 1)} disabled={page === 0}><ArrowLeft size={16} /></button><div className={styles.dots}>{chapters.map((chapter, index) => <button key={chapter} aria-label={`${t('Page')} ${index + 1}: ${t(chapter)}`} aria-current={page === index ? 'step' : undefined} onClick={() => navigate(index)}><span /></button>)}</div><button aria-label={t('Next page')} onClick={() => navigate(page + 1)} disabled={page === chapters.length - 1}><ArrowRight size={16} /></button></nav>
    <div className={styles.controls} role="toolbar" aria-label={t('Presentation controls')}><span className={styles.arrowHint}>← → {t('Navigate')}</span><button aria-label={t('Static mode')} aria-keyshortcuts="b" aria-pressed={staticMode} onClick={() => setStaticMode(value => !value)}>{staticMode ? <Pause size={12} /> : <Play size={12} />}<kbd>B</kbd>{t(staticMode ? 'Static' : 'Motion')}</button><button ref={overviewButton} aria-label={t('All pages')} aria-keyshortcuts="Escape" aria-haspopup="dialog" onClick={() => setOverview(true)}><Grid2X2 size={12} /><kbd>ESC</kbd>{t('All pages')}</button><button aria-label={t('Presentation mode')} aria-keyshortcuts="p" aria-pressed={presenting} onClick={() => setPresenting(value => !value)}><Presentation size={12} /><kbd>P</kbd>{t('Present')}</button></div>
    <span className={styles.pageAnnouncement} aria-live="polite">{t('Page')} {page + 1} / {chapters.length} · {t(chapters[page])}</span>
    <dialog ref={dialog} className={styles.overview} aria-labelledby="pitch-overview-heading" onCancel={event => { event.preventDefault(); setOverview(false); }} onClose={() => setOverview(false)}><div className={styles.overviewHeader}><div><span className={styles.kicker}>{published ? '贸脉 TRADERAIL' : 'TRADERAIL'} / {String(chapters.length).padStart(2, '0')}</span><h2 id="pitch-overview-heading">{t('The whole story')}</h2></div><button aria-label={t('Close overview')} onClick={() => setOverview(false)}><X size={22} /></button></div><div className={styles.overviewGrid}>{chapters.map((chapter, index) => <button key={chapter} onClick={() => navigate(index)} aria-current={page === index ? 'step' : undefined}><span className={styles.miniPage}><span>0{index + 1} / {t(chapter)}</span>{index === 0 ? <strong className={styles.miniWordmark}>{published && <span className={styles.miniChineseWordmark}>贸脉</span>}TradeRail.</strong> : <strong>{t(headlines[index])}</strong>}<span className={styles.miniRule} /></span><span className={styles.miniCaption}>{String(index + 1).padStart(2, '0')} · {t(chapter)}<ArrowUpRight size={14} /></span></button>)}</div></dialog>
  </main>;
}
