'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Boxes, Check, CheckCheck, ChevronDown, CircleDollarSign, Clock3, FileCheck2, Landmark, Maximize2, Minimize2, Pause, Play, Radio, RotateCcw, ScanLine, ShieldCheck, ShoppingBag, Wallet, X } from 'lucide-react';
import { useRailDemo } from '@/lib/use-rail-demo';
import { useLocale } from '@/lib/i18n/locale';
import { confirmedMotions, presentationState, type MoneyMotion } from '@/lib/rail-presentation';
import type { RailMode, RailOperation } from '@/lib/rail-types';
import { railExplorer } from '@backend/config/traderail';
import styles from './settlement-stage.module.css';

const amount = (value: number) => value.toLocaleString('en-US');
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
type CapitalPaths = Record<'fund' | 'advance' | 'buyer' | 'lender' | 'supplier', string>;
type Motion = { step: MoneyMotion; hash: string; key: string; replay: boolean };

export function SettlementStage() {
  const { locale, ready, hasPreference, setLocale, t } = useLocale();
  const say = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale]);
  const demo = useRailDemo();
  const data = demo.data;
  const order = demo.newDraft && data?.order?.next === 'complete' ? null : data?.order;
  const [choice, setChoice] = useState<RailMode>('financed');
  const [interaction, setInteraction] = useState<'scenes' | 'auto' | 'scan'>('scenes');
  const [focus, setFocus] = useState(false);
  const [assumptions, setAssumptions] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState('');
  const [candidate, setCandidate] = useState('');
  const [scanError, setScanError] = useState('');
  const [motion, setMotion] = useState<Motion | null>(null);
  const [eventFlash, setEventFlash] = useState(false);
  const seen = useRef({ id: '', hashes: new Set<string>(), accepted: false });
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const motionSvg = useRef<SVGSVGElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; paths: CapitalPaths }>({ width: 1000, height: 480, paths: { fund: '', advance: '', buyer: '', lender: '', supplier: '' } });
  const svgId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const state = presentationState(order, choice);
  const { financed, accepted, advanced, paid, synced } = state;
  const complete = order?.next === 'complete' && synced;
  const pending = !!order?.pending;
  const disabled = demo.busy || pending || !data?.enabled || !!data.archived;
  const currentMode = order?.mode ?? choice;
  const operations = Object.values(order?.operations ?? {});
  const latest = order?.pending ?? operations.at(-1);
  const signed = !!order?.records.some(record => record.signature);
  const expected = order && ['ship', 'accept'].includes(order.next) ? `${order.id}:${order.next.toUpperCase()}` : '';

  useEffect(() => { if (ready && !hasPreference) setLocale('zh'); }, [ready, hasPreference, setLocale]);
  useEffect(() => { document.title = `TradeRail · ${say('现场结算演示', 'Live settlement')}`; }, [say, !!data]);
  useEffect(() => {
    const stop = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setFocus(false); setScanOpen(false); setAssumptions(false); }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('section[aria-modal="true"]');
      const controls = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', stop);
    return () => window.removeEventListener('keydown', stop);
  }, []);

  useEffect(() => {
    if (!assumptions && !scanOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('section[aria-modal="true"] button')?.focus();
    return () => { if (trigger?.isConnected) trigger.focus(); };
  }, [assumptions, scanOpen]);

  const playMotion = useCallback((step: MoneyMotion, hash: string, replay: boolean) => {
    if (motionTimer.current) clearTimeout(motionTimer.current);
    setMotion({ step, hash, replay, key: `${hash}:${Date.now()}` });
    motionTimer.current = setTimeout(() => setMotion(null), step === 'pay' ? 6800 : 4200);
  }, []);
  useEffect(() => {
    if (!motion) return;
    // Start relative to this confirmed receipt, not the SVG document's age.
    motionSvg.current?.querySelectorAll<SVGAnimationElement>('[data-packet-delay]').forEach(animation => {
      animation.beginElementAt(Number(animation.getAttribute('data-packet-delay')));
    });
  }, [motion?.key]);
  useEffect(() => () => { if (motionTimer.current) clearTimeout(motionTimer.current); }, []);
  useEffect(() => {
    const id = order?.id ?? '';
    const confirmed = confirmedMotions(order);
    if (seen.current.id !== id) {
      // Loading or switching an order is a static historical view. It never
      // pretends that an old payment just happened, or sends another payment.
      seen.current = { id, hashes: new Set(confirmed.map(op => op.hash)), accepted };
      setMotion(null);
      setEventFlash(false);
      return;
    }
    const fresh = confirmed.filter(op => !seen.current.hashes.has(op.hash));
    confirmed.forEach(op => seen.current.hashes.add(op.hash));
    if (fresh.length) { const last = fresh.at(-1)!; playMotion(last.step, last.hash, false); }
    if (accepted && !seen.current.accepted) { setEventFlash(true); }
    seen.current.accepted = accepted;
  }, [order, accepted, playMotion]);
  useEffect(() => {
    if (!eventFlash) return;
    const timer = setTimeout(() => setEventFlash(false), 3200);
    return () => clearTimeout(timer);
  }, [eventFlash]);
  useEffect(() => {
    setCandidate(''); setCode(''); setScanError('');
    if (order && !['register', 'ship', 'accept'].includes(order.next)) setScanOpen(false);
  }, [order?.id, order?.next]);
  useEffect(() => { if (scanOpen && expected) scanInput.current?.focus(); }, [scanOpen, expected]);

  const start = async () => {
    if (data?.archived) { demo.select(''); return; }
    if (complete) { demo.prepare(); return; }
    if (!order) {
      const result = await demo.create(choice, interaction !== 'scan', { until: interaction === 'scenes' ? (choice === 'financed' ? 'fund' : 'pay') : undefined, presentation: true });
      if (result && interaction === 'scan') setScanOpen(true);
    } else if (interaction === 'scan' && ['ship', 'accept'].includes(order.next)) {
      setScanOpen(true);
    } else {
      demo.runUntil(interaction === 'auto' ? undefined : state.boundary);
    }
  };
  const replay = () => {
    const last = confirmedMotions(order).at(-1);
    if (last) { demo.pause(); playMotion(last.step, last.hash, true); }
  };

  const acts = financed
    ? [say('验收确认', 'Confirm delivery'), say('提前取得现金', 'Receive an advance'), say('回款自动分配', 'Settle and allocate')]
    : [say('验收确认', 'Confirm delivery'), say('买方支付货款', 'Pay the supplier'), say('回执同步完成', 'Reconcile the receipt')];
  const heading = !order ? say('货物已有记录，\n让资金跟上业务。', 'Goods are recorded.\nLet capital follow.')
    : synced ? say('这笔回款，\n各归其位。', 'One payment.\nEvery party paid.')
    : paid ? say('资金已经到账，\n回执同步企业。', 'Funds have arrived.\nReturn the receipt.')
    : !accepted ? say('货物待验收，\n现金还在路上。', 'Confirm the goods.\nCash is still waiting.')
    : financed && !advanced ? say('应收款已确认，\n现金可以先到。', 'Receivable confirmed.\nGet cash earlier.')
    : financed ? say('买方付一次，\n本息、余款同时结算。', 'The buyer pays once.\nSplit the proceeds.')
    : say('业务条件已满足，\n货款按约定到账。', 'Conditions are met.\nExecute the payment.');
  const description = !order ? say('一笔 100,000 的贸易订单。先看双方付款，再看第三方如何让供应商提前收到现金。', 'A 100,000 trade order. Settle directly, or add a lender to bring supplier cash forward.')
    : synced ? financed ? say('供应商累计收到 99,000，资金方已收回 50,000 本金和 1,000 利息。', 'The supplier received 99,000 in total. The lender recovered 50,000 principal plus 1,000 interest.') : say('买方支付 100,000，供应商收到 100,000。全程没有贷款关系。', 'The buyer paid 100,000. The supplier received 100,000. No lending relationship.')
    : !accepted ? say('模拟 ERP 记录出运与买方验收。业务记录和资金转账分别确认。', 'The mock ERP records shipment and buyer acceptance. Business records and payments remain distinct.')
    : financed && !advanced ? say('资金方真实注资 50,000，合约核验授权后将这笔本金付给供应商。', 'The lender deposits 50,000. Verified instructions release that capital to the supplier.')
    : financed ? say('100,000 进入协议，同笔交易分为资金方 51,000 与供应商余款 49,000。', 'One 100,000 payment allocates 51,000 to the lender and 49,000 to the supplier atomically.')
    : say('验证买方授权与业务指令，将 100,000 货款转给供应商，再回写确认回执。', 'Verify buyer authorization, send 100,000 to the supplier, then sync the confirmed receipt.');
  const action = complete ? say('再演示一笔', 'Prepare another demo') : !order ? say('开始这笔订单', 'Start this order')
    : !accepted ? interaction === 'scan' ? say('扫描业务事件', 'Scan a business event') : say('确认出运与验收', 'Confirm shipment and acceptance')
    : financed && !advanced ? say('预支现金 50,000', 'Advance 50,000') : paid ? say('同步确认回执', 'Sync the receipt') : say('支付货款并结算', 'Pay and settle');
  const operationName = (op: RailOperation | undefined) => !op ? say('等待第一笔交易', 'Waiting for the first transaction') : ({ register: say('订单条款登记', 'Order terms registered'), fund: say('资金方注资', 'Lender deposit'), advance: say('供应商预支到账', 'Supplier advance'), pay: say('买方回款与分配', 'Buyer payment and allocation') }[op.step] ?? op.step);
  const network = data?.deployment.network === 'local' ? 'Local EVM' : 'Monad Testnet';
  const proofHref = order ? `/evidence?order=${order.id}` : '/evidence';
  const paths = geometry.paths;
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const nodes = Array.from(graph.querySelectorAll<HTMLElement>('[data-flow-node]'));
    const measure = () => {
      const bounds = graph.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const rect = (name: string) => {
        const r = graph.querySelector<HTMLElement>(`[data-flow-node="${name}"]`)!.getBoundingClientRect();
        return { left: r.left - bounds.left, right: r.right - bounds.left, top: r.top - bounds.top, bottom: r.bottom - bounds.top, x: r.left - bounds.left + r.width / 2, y: r.top - bounds.top + r.height / 2 };
      };
      const buyer = rect('buyer'), supplier = rect('supplier'), hub = rect('hub');
      const curve = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;
      let paths: CapitalPaths;
      if (financed) {
        const lender = rect('lender');
        const narrow = window.matchMedia('(max-width: 600px)').matches;
        paths = {
          buyer: `M ${buyer.x} ${buyer.bottom + 5} L ${hub.x} ${hub.top - 5}`,
          fund: narrow ? curve(lender.x - 10, lender.top - 5, hub.left - 5, hub.y - 8) : curve(lender.right + 5, lender.y - 10, hub.left - 5, hub.y - 8),
          advance: narrow ? curve(hub.right + 5, hub.y - 8, supplier.x - 10, supplier.top - 5) : curve(hub.right + 5, hub.y - 8, supplier.left - 5, supplier.y - 10),
          lender: narrow ? curve(hub.left - 5, hub.y + 8, lender.x + 10, lender.top - 5) : curve(hub.left - 5, hub.y + 8, lender.right + 5, lender.y + 10),
          supplier: narrow ? curve(hub.right + 5, hub.y + 8, supplier.x + 10, supplier.top - 5) : curve(hub.right + 5, hub.y + 8, supplier.left - 5, supplier.y + 10),
        };
      } else {
        const narrow = window.matchMedia('(max-width: 600px)').matches;
        paths = { fund: '', advance: '', lender: '', buyer: narrow ? curve(buyer.x, buyer.top - 5, hub.left - 5, hub.y) : curve(buyer.right + 5, buyer.y, hub.left - 5, hub.y), supplier: narrow ? curve(hub.right + 5, hub.y, supplier.x, supplier.top - 5) : curve(hub.right + 5, hub.y, supplier.left - 5, supplier.y) };
      }
      setGeometry(previous => {
        const next = { width: bounds.width, height: bounds.height, paths };
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
    };
    const observer = new ResizeObserver(measure);
    [graph, ...nodes].forEach(node => observer.observe(node));
    measure();
    return () => observer.disconnect();
  }, [financed, locale, focus, !!data, paid, advanced]);

  if (!data && !demo.error) return <div className={styles.loading}><Boxes size={28}/><strong>TradeRail</strong><p>{say('正在读取原订单与链上回执…', 'Reading the order and original receipts…')}</p></div>;
  return <div className={`${styles.stagePage} ${focus ? styles.focus : ''}`} data-testid="settlement-stage" data-act={state.act + 1} data-order={order?.id ?? 'draft'}>
    <header className={styles.header}>
      <Link href="/?new=1" className={styles.brand}><Boxes size={25}/>TradeRail<span>.</span></Link>
      <div className={styles.network}><i/><span>{network}</span><b>MockUSDC</b></div>
      <nav><Link href="/pitch">{say('项目介绍', 'Pitch')}<ArrowUpRight size={13}/></Link><Link href="/operations">{say('操作台', 'Operations')}</Link><div className={styles.language}><button aria-label="切换为中文" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button><button aria-label="Switch to English" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button></div><button className={styles.focusButton} aria-label={say('切换投屏模式', 'Toggle presentation focus')} aria-pressed={focus} onClick={() => setFocus(value => !value)}>{focus ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button></nav>
    </header>

    <div className={styles.intro}>
      <div><span className={styles.eyebrow}>BUSINESS IN MOTION. CAPITAL IN SYNC.</span><h1>{say('每一步业务，都看得见资金回应。', 'See business move. Watch capital follow.')}</h1></div>
      <div className={styles.modeSwitch} aria-label={say('选择结算模式', 'Choose settlement model')}>{(['direct', 'financed'] as const).map(mode => <button key={mode} disabled={!!order && !complete} aria-pressed={currentMode === mode} onClick={() => { demo.pause(); setChoice(mode); if (complete) demo.prepare(); }}><span>{mode === 'direct' ? '2' : '3'}</span><div>{say(mode === 'direct' ? '双方付款' : '三方融资', mode === 'direct' ? 'Trade payment' : 'Receivable finance')}<small>{say(mode === 'direct' ? '买方 · 供应商' : '买方 · 供应商 · 资金方', mode === 'direct' ? 'Buyer · Supplier' : 'Buyer · Supplier · Lender')}</small></div></button>)}</div>
    </div>
    <div className={styles.assumptionStrip}><ShieldCheck size={15}/><span>{say('演示前提：实物信息由第三方核验；各方授权美元稳定币结算。', 'Assumptions: a trusted provider verifies goods; parties authorize dollar-stablecoin settlement.')}</span><button onClick={() => setAssumptions(true)}>{say('查看边界', 'View assumptions')}<ChevronDown size={13}/></button><b>{say('事件源：模拟 ERP', 'Source: mock ERP')}</b></div>

    <section className={styles.theater} aria-label={say('实时结算演示舞台', 'Live settlement theater')}>
      <div className={styles.orderLine}><span><b>{order?.id ?? say('新演示订单', 'New demo order')}</b> <span>100,000 <small>MockUSDC</small></span></span><label>{say('历史', 'History')}<select aria-label={say('订单历史', 'Order history')} value={order?.id ?? ''} disabled={demo.busy || pending || demo.automatic} onChange={event => demo.select(event.target.value)}><option value="">{say('当前 / 新一轮', 'Active / next order')}</option>{data?.history.map(item => <option key={item.id} value={item.id}>{item.id} · {item.mode === 'financed' ? say('三方融资', '3 parties') : say('双方付款', '2 parties')}{item.paid ? ' ✓' : ''}</option>)}</select></label></div>
      <ol className={styles.acts} aria-label={say('业务场景', 'Business scenes')}>{acts.map((label, index) => <li key={label} className={`${state.act === index ? styles.actCurrent : ''} ${state.done[index] ? styles.actDone : ''}`} aria-current={state.act === index ? 'step' : undefined}><span>{state.done[index] ? <Check size={15}/> : `0${index + 1}`}</span><strong>{label}</strong>{index < 2 && <ArrowRight size={15}/>}</li>)}</ol>

      <div className={styles.mainScene}>
        <div className={styles.story}>
          <span className={styles.sceneKicker}>{complete ? <CheckCheck size={15}/> : <span className={styles.sceneDot}/>} {complete ? say('本轮已结算', 'SETTLED & RECONCILED') : `${say('场景', 'SCENE')} 0${state.act + 1}`}</span>
          <h2>{heading}</h2><p>{description}</p>
          <div className={`${styles.heroAmount} ${advanced || paid ? styles.heroReceived : ''}`} key={`${order?.id}:${advanced}:${paid}`}><span>{paid ? say('供应商本轮累计收款', 'SUPPLIER TOTAL RECEIVED') : advanced ? say('供应商已提前收到', 'SUPPLIER ADVANCE RECEIVED') : say('这笔订单的货款', 'ORDER PAYMENT')}</span><strong>{paid ? amount(state.total) : advanced ? '50,000' : '100,000'}<small>MockUSDC</small></strong><p>{advanced && !paid ? say('买方尚未付款 · 未偿本息 51,000', 'Buyer has not paid yet · 51,000 principal + interest outstanding') : financed ? say('约定预支 50,000 · 固定示例利息 1,000', 'Agreed advance 50,000 · fixed example interest 1,000') : say('两个资金主体 · 没有贷款或利息', 'Two financial parties · no loan or interest')}</p></div>
          <div className={styles.controls}>
            <div className={styles.interaction} role="group" aria-label={say('演示方式', 'Presentation interaction')}>{(['scenes', 'auto', 'scan'] as const).map(mode => <button key={mode} aria-pressed={interaction === mode} onClick={() => { demo.pause(); setInteraction(mode); }}>{mode === 'scan' && <ScanLine size={13}/>} {say(mode === 'scenes' ? '按场景' : mode === 'auto' ? '自动串联' : '扫码', mode === 'scenes' ? 'Scenes' : mode === 'auto' ? 'Auto' : 'Scan')}</button>)}</div>
            {demo.automatic ? <button className={styles.primary} onClick={demo.pause}><Pause size={18}/>{say('本笔确认后暂停', 'Pause after this transaction')}</button> : <button className={styles.primary} disabled={!data?.archived && disabled} onClick={() => void start()}>{data?.archived ? <ArrowRight size={18}/> : complete ? <RotateCcw size={18}/> : <Play size={18}/>} {data?.archived ? say('返回当前订单', 'Return to active order') : demo.busy ? say('正在提交…', 'Submitting…') : pending ? say('等待原交易确认…', 'Awaiting original receipt…') : interaction === 'auto' && !complete ? say('一键自动演示', 'Run automatically') : action}</button>}
            {pending && <button className={styles.recover} disabled={demo.busy || !!data?.archived} onClick={demo.recover}>{say('查询 / 恢复原签名交易', 'Check / recover original submission')}</button>}
            <small>{demo.automatic ? say('真实回执确认后推进，关键到账结果留出讲解时间。', 'Advances after real receipts, with time to explain the confirmed capital movement.') : complete ? say('新一轮保留所有历史订单和回执。', 'The next demo preserves every historical order and receipt.') : say('演示角色已预授权；签收与付款分别确认。', 'Test roles are preauthorized. Acceptance and payment remain distinct.')}</small>
          </div>
          {(demo.error || order?.pending?.error) && <div className={styles.error} role="alert"><strong>{say('流程已暂停，保留原交易', 'Paused · original transaction retained')}</strong><span>{t(demo.error || order?.pending?.error || '')}</span><button onClick={demo.refresh}>{say('重新查询', 'Check again')}</button></div>}
          {!data?.enabled && <p className={styles.readonly}>{say('当前仅可核验，未启用本机测试签名。', 'Read-only: local test signing is unavailable.')}</p>}
        </div>

        <div className={styles.visual} aria-label={say(financed ? '三方资金关系图' : '双方资金关系图', financed ? 'Three-party capital flow' : 'Two-party capital flow')}>
          <div className={styles.visualHeader}><span>{say(financed ? '三方资金关系' : '双方资金关系', financed ? 'THREE FINANCIAL PARTIES' : 'TWO FINANCIAL PARTIES')}</span><b className={motion ? styles.motionBadge : ''}>{motion ? say(motion.replay ? '已确认转账回放' : '真实到账 · 正在呈现', motion.replay ? 'CONFIRMED TRANSFER REPLAY' : 'CONFIRMED · NOW VISUALIZING') : pending ? say('确认中 · 金额尚未计入', 'PENDING · NOT COUNTED AS RECEIVED') : say('仅展示本订单资金', 'THIS ORDER’S FUNDS ONLY')}</b></div>
          <div className={`${styles.sourceLane} ${eventFlash ? styles.sourceFlash : ''}`}><span className={accepted ? styles.sourceDone : ''}><Boxes size={15}/>{say('ERP 验收记录', 'ERP acceptance')}{accepted && <Check size={13}/>}</span><ArrowRight size={14}/><span className={signed ? styles.sourceDone : ''}><FileCheck2 size={15}/>{say('授权指令', 'Signed instruction')}{signed && <Check size={13}/>}</span><ArrowRight size={14}/><span className={paid || advanced ? styles.sourceDone : ''}><ShieldCheck size={15}/>{say('Monad 执行', 'Monad execution')}</span></div>
          <div ref={graphRef} className={`${styles.moneyGraph} ${financed ? styles.financeGraph : styles.directGraph}`} data-testid="money-graph" data-motion={motion?.step ?? 'idle'}>
            <svg ref={motionSvg} className={styles.connections} viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
              <defs><marker id={`${svgId}arrow`} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="context-stroke" strokeWidth="1.2"/></marker></defs>
              {([
                ['buyer', paid], ['fund', state.funded], ['advance', advanced], ['lender', paid && financed], ['supplier', paid],
              ] as const).map(([name, done]) => paths[name] && <path key={name} id={`${svgId}${name}`} d={paths[name]} className={`${styles.rail} ${done ? styles.railDone : ''} ${motion && (motion.step === name || motion.step === 'pay' && ['buyer', 'lender', 'supplier'].includes(name)) ? styles.railActive : ''}`} markerEnd={`url(#${svgId}arrow)`}/>)}
              {motion && <g key={motion.key} className={styles.moneyPackets}>{(motion.step === 'pay' ? [{ path: 'buyer', begin: 0 }, ...(financed ? [{ path: 'lender', begin: 1.7 }] : []), { path: 'supplier', begin: 1.9 }] : [{ path: motion.step, begin: 0 }]).flatMap(route => [0, 0.24, 0.48].map((delay, index) => <g key={`${route.path}${index}`} opacity="0"><circle r="11" fill="#26a777" stroke="#fff" strokeWidth="3"/><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="13" fontWeight="700">$</text><animateMotion dur="1.6s" begin="indefinite" data-packet-delay={route.begin + delay} fill="freeze" path={paths[route.path as keyof typeof paths]}/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.92;1" dur="1.6s" begin="indefinite" data-packet-delay={route.begin + delay} fill="freeze"/></g>))}</g>}
            </svg>

            <article data-flow-node="buyer" className={`${styles.actor} ${styles.buyer} ${paid ? styles.received : ''}`}><span className={styles.actorIcon}><ShoppingBag size={23}/></span><div><h3>{say('买方', 'Buyer')}</h3><small>{paid ? say('本轮已支付', 'PAID THIS ORDER') : say('约定应付货款', 'AGREED PAYMENT')}</small><strong>{paid ? '−100,000' : '100,000'}</strong><p>{paid ? <><Check size={12}/>{say('付款已确认', 'Payment confirmed')}</> : say('按约定授权支付', 'Authorized under agreed terms')}</p></div></article>
            {financed && <article data-flow-node="lender" className={`${styles.actor} ${styles.lender} ${paid ? styles.received : ''}`}><span className={styles.actorIcon}><Landmark size={23}/></span><div><h3>{say('资金方', 'Lender')}</h3><small>{paid ? say('已收回本金与利息', 'PRINCIPAL + INTEREST RECEIVED') : advanced ? say('待收回本息', 'PRINCIPAL + INTEREST DUE') : say('约定预支本金', 'AGREED ADVANCE')}</small><strong>{paid ? '+51,000' : advanced ? '51,000' : '50,000'}</strong><p>{paid ? <><Check size={12}/>{say('本金 50,000 + 利息 1,000', '50,000 principal + 1,000 interest')}</> : state.funded ? say('本金已真实注资', 'Capital deposit confirmed') : say('独立第三方提供资金', 'Capital from a third party')}</p></div></article>}
            <div className={`${styles.hub} ${pending || demo.busy ? styles.hubWaiting : ''}`}><span data-flow-node="hub" className={styles.hubIcon}><Boxes size={31}/></span><strong>TradeRail</strong><small>◈ Monad</small>{state.escrow > 0 ? <b>{say('订单资金', 'ORDER FUNDS')} 50,000</b> : <b>{pending || demo.busy ? say('核验 / 执行中', 'VERIFYING / EXECUTING') : paid ? say('分配已确认', 'ALLOCATION CONFIRMED') : say('按授权执行资金', 'AUTHORIZED SETTLEMENT')}</b>}</div>
            <article data-flow-node="supplier" className={`${styles.actor} ${styles.supplier} ${advanced || paid ? styles.received : ''}`} key={`supplier:${advanced}:${paid}`} data-cash={advanced || paid ? 'received' : 'waiting'}><span className={styles.actorIcon}><Wallet size={23}/></span><div><h3>{say('供应商', 'Supplier')}</h3><small>{paid ? say('本轮累计到账', 'TOTAL RECEIVED THIS ORDER') : advanced ? say('买方付款前已到账', 'RECEIVED BEFORE BUYER PAYMENT') : say('现金状态', 'CASH STATUS')}</small><strong data-testid="supplier-received">{paid ? `+${amount(state.total)}` : advanced ? '+50,000' : say('待到账', 'Awaiting cash')}</strong><p>{paid ? <><Check size={12}/>{financed ? say('预支 50,000 + 余款 49,000', '50,000 advance + 49,000 proceeds') : say('货款 100,000 全额到账', '100,000 payment received')}</> : advanced ? <><Check size={12}/>{say('买方尚未付款', 'Buyer has not paid yet')}</> : accepted ? say('应收款 100,000 已确认', '100,000 receivable confirmed') : say('随业务条件推进', 'Follows business conditions')}</p></div></article>
          </div>
          <div className={`${styles.resultStrip} ${paid ? styles.resultConfirmed : ''}`} aria-live="polite">{paid ? <><CheckCheck size={22}/><div><strong>{say('一笔回款，完成约定分配。', 'One payment. The agreed allocation complete.')}</strong><p>{financed ? say('资金方 51,000 · 供应商余款 49,000 · 未偿本息 0', 'Lender 51,000 · Supplier proceeds 49,000 · Outstanding debt 0') : say('买方支付 100,000 · 供应商收到 100,000', 'Buyer paid 100,000 · Supplier received 100,000')}</p></div></> : advanced ? <><CircleDollarSign size={24}/><div><strong>{say('现金先到，业务继续。', 'Cash arrives earlier. Business continues.')}</strong><p>{say('已提前到账 50,000 · 约定本息 51,000 · 等待买方付款', '50,000 received early · 51,000 principal + interest · Buyer payment pending')}</p></div></> : <><Clock3 size={22}/><div><strong>{say('已有业务记录，资金执行接着发生。', 'Business records first. Authorized capital follows.')}</strong><p>{financed ? say('资金方预支 → 供应商；买方回款 → 本息与余款。', 'Lender advance → supplier. Buyer payment → principal, interest and proceeds.') : say('买方 → TradeRail → 供应商；付款条件由各方约定。', 'Buyer → TradeRail → supplier, under agreed payment conditions.')}</p></div></>}</div>
        </div>
      </div>

      <footer className={styles.proofBar} aria-label={say('全宽链上证据条', 'Full-width onchain evidence')}>
        <div className={styles.proofTitle}><Radio size={19}/><div><strong>{say('链上证据', 'ONCHAIN EVIDENCE')}</strong><small>{say('可独立核验的真实回执', 'Real, independently verifiable receipts')}</small></div></div>
        <div className={styles.latestProof}><span className={latest?.state === 'confirmed' ? styles.confirmedBadge : styles.pendingBadge}>{latest?.state === 'confirmed' ? <Check size={13}/> : <Clock3 size={13}/>} {latest ? t(latest.state) : say('待执行', 'Ready')}</span><strong>{operationName(latest)}</strong>{latest?.hash && <a href={railExplorer ? `${railExplorer}/tx/${latest.hash}` : proofHref} target="_blank" rel="noreferrer">{short(latest.hash)}<ArrowUpRight size={12}/></a>}{latest?.block && <small>#{latest.block}</small>}</div>
        <div className={styles.proofActions}>{confirmedMotions(order).length > 0 && <button onClick={replay} aria-label={say('重播已确认转账，不发送交易', 'Replay confirmed transfer without sending a transaction')}><RotateCcw size={14}/>{say('重播动画', 'Replay')}</button>}<Link href={proofHref}>{say('完整证据', 'Full evidence')}<ArrowUpRight size={14}/></Link></div>
      </footer>
    </section>
    <div className={styles.footnote}><span>{say('模拟 ERP 事件 × 真实测试链转账。金额仅在成功回执确认后显示为到账。', 'Mock ERP events × real test-chain transfers. Received amounts require confirmed successful receipts.')}</span><span>{say('利息为固定示例；当前地址与金额公开。', 'Fixed example interest. Current addresses and amounts are public.')}</span></div>

    {assumptions && <div className={styles.modalBackdrop} onClick={() => setAssumptions(false)}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="assumption-title" onClick={event => event.stopPropagation()}><button className={styles.close} aria-label={say('关闭', 'Close')} onClick={() => setAssumptions(false)}><X size={20}/></button><ShieldCheck size={30}/><h2 id="assumption-title">{say('从这些前提出发', 'The assumptions behind this demo')}</h2><p>{say('第三方供应链服务商已核验实物，通过 ERP 或联盟链提供可信业务信息。本轮使用模拟 ERP，没有接入真实仓储系统。', 'A third-party supply-chain provider verifies physical goods and supplies trusted information through ERP or consortium ledgers. This demo uses a mock ERP, without a production warehouse integration.')}</p><p>{say('买方、供应商和可选资金方同意美元稳定币结算，并已授权演示条款。当前使用无美元价值的 MockUSDC，后台由本机预设测试角色签名。', 'Buyer, supplier and optional lender agree dollar-stablecoin settlement and authorize the example terms. MockUSDC has no real dollar value; isolated local test roles sign demo instructions.')}</p><p>{say('融资采用买方验收后的应收款。自动分配不保证买方偿付，也不缩短商业账期。私密结算和真实企业接入属于后续路线。', 'Financing uses the receivable after buyer acceptance. Automatic allocation does not guarantee buyer repayment or shorten commercial terms. Private settlement and production enterprise integration remain future work.')}</p><button className={styles.primary} onClick={() => setAssumptions(false)}>{say('回到演示', 'Back to the demo')}<ArrowRight size={16}/></button></section></div>}
    {scanOpen && <div className={styles.modalBackdrop}><section className={`${styles.modal} ${styles.scanModal}`} role="dialog" aria-modal="true" aria-labelledby="scan-title"><button className={styles.close} aria-label={say('关闭扫码', 'Close scanner')} onClick={() => setScanOpen(false)}><X size={20}/></button><div className={styles.scanIcon}><ScanLine size={38}/><span/></div><span className={styles.eyebrow}>PHYSICAL EVENT → BUSINESS RECORD</span><h2 id="scan-title">{say('扫描货物，确认业务事件。', 'Scan the goods. Confirm the event.')}</h2><p>{say('匹配本订单及当前阶段，屏幕确认后才写入模拟 ERP。扫码本身不替代支付授权。', 'Match this order and stage, then confirm before writing to the mock ERP. A scan does not replace payment authorization.')}</p><form onSubmit={event => { event.preventDefault(); if (!expected || code.trim() !== expected) { setScanError(say('条码与当前订单或阶段不匹配。', 'Barcode does not match the current order or stage.')); setCandidate(''); } else { setCandidate(code.trim()); setScanError(''); } }}><label>{say('业务事件条码', 'Business event barcode')}<input ref={scanInput} disabled={!expected || disabled} value={code} onChange={event => setCode(event.target.value)} placeholder={expected || say('等待订单登记确认…', 'Waiting for order registration…')} autoComplete="off"/></label><small>{say('当前目标码', 'Expected code')}: <code>{expected || '—'}</code></small><div className={styles.scanActions}><button type="submit" disabled={!expected || disabled}>{say('识别条码', 'Match barcode')}</button><button type="button" disabled={!expected || disabled} onClick={() => { setCode(expected); setCandidate(expected); setScanError(''); }}>{say('模拟扫码', 'Simulate scan')}</button></div>{candidate && <div className={styles.scanMatched}><CheckCheck size={22}/><strong>{say('订单与事件已匹配', 'Order and event matched')}</strong><code>{candidate}</code><button type="button" className={styles.primary} disabled={disabled} onClick={() => void demo.step(order!.next, candidate)}>{say('确认本次业务事件', 'Confirm this business event')}<ArrowRight size={16}/></button></div>}{scanError && <p role="alert" className={styles.scanError}>{scanError}</p>}</form></section></div>}
  </div>;
}
