'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useLocale } from '@/lib/i18n/locale';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, ArrowUpRight, Box, Boxes, ChevronRight, CircleHelp, Languages, LayoutDashboard, Presentation, Radio, ShieldCheck, Warehouse, Wallet } from 'lucide-react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { chain, isLocal } from '@backend/config/chain';
import { railChain, railDeployment } from '@backend/config/traderail';
import { shortAddress } from '@/lib/types';

function ShellContent({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale, message } = useLocale();
  const path = usePathname();
  const params = useSearchParams();
  const currentLocal = (path === "/" || path === "/evidence" || path === "/operations") && railDeployment.enabled ? railDeployment.network === "local" : isLocal;
  const shipmentId = params.get("shipmentId");
  const navHref = (route: string) => { const query = new URLSearchParams(); if (shipmentId) query.set("shipmentId", shipmentId); if (params.get("view") === "private") query.set("view", "private"); return route + (query.size ? `?${query}` : ""); };
  const { address } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  if (['/supplier','/goods'].includes(path) || path === '/pitch' || (path === '/' && railDeployment.enabled)) return <>{children}</>;
  return <div className={`app-shell ${(path === "/verification" || path === "/" || path === "/legacy" || path === "/evidence" || path === "/operations") ? "verification-shell" : ""}`}>
    <aside className="sidebar">
      <Link href={navHref("/")} className="brand"><span className="brand-mark"><Boxes size={23} /></span>TradeRail<span className="brand-dot">.</span></Link>
      <div className="workspace"><span className="workspace-icon">S</span><div>{t("Shanghai workspace")}<small>{t("Supply chain finance")}</small></div><ChevronRight size={15} /></div>
      <div className="nav-label">{t("WORKSPACE")}</div>
      <nav>
        <Link className={path === "/finance" ? "nav-link active" : "nav-link"} href={navHref("/finance")}><Wallet size={18}/>{t("Supplier finance")}</Link>
        <Link className={path === '/' ? 'nav-link active' : 'nav-link'} href={navHref("/")}><LayoutDashboard size={18} />{t("Order journey")}<span className="nav-count">01</span></Link>
        <Link className={path === '/erp' ? 'nav-link active' : 'nav-link'} href={navHref("/erp")}><Warehouse size={18} />{t("Warehouse ERP")}<ArrowUpRight size={14} /></Link>
        <Link className={path === '/verification' ? 'nav-link verification-entry active' : 'nav-link verification-entry'} href={navHref("/verification")} aria-current={path === '/verification' ? 'page' : undefined}><ShieldCheck size={18} />{t("Chain verification")}</Link>
        <Link className={path === '/architecture' ? 'nav-link active' : 'nav-link'} href="/architecture"><Activity size={18} />{t("How it works")}</Link>
        <Link className="nav-link pitch-entry" href="/pitch"><Presentation size={18} />{t('Project Pitch')}<ArrowUpRight size={14} /></Link>
      </nav>
      <div className="sidebar-note"><Box size={20} /><strong>{t("Physical events.")}<br />{t("Financial consequences.")}</strong><p>{t("Credit moves when your supply chain does.")}</p></div>
      <div className="sidebar-bottom"><span className="network-dot" /><div>{isLocal ? t("Local EVM") : 'Monad Testnet'}<small>{isLocal ? t("Real contracts · demo accounts") : t("Public settlement · mock USDC")}</small></div><Radio size={15} /></div>
      <div className="sidebar-footer"><CircleHelp size={14} />{t("Hackathon MVP")}<span>v1.0</span></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><div className="breadcrumbs"><Link className="shell-home" href={navHref("/")}>TradeRail<span>.</span></Link>{path !== "/" && t("Workspace")}<ChevronRight size={13} /><strong>{path === '/erp' ? t("Warehouse ERP") : (path === '/verification' || path === '/evidence') ? t("Events & onchain verification") : path === '/architecture' ? t("Architecture") : path === "/finance" ? t("Supplier finance") : t("Order journey")}</strong></div>
        <div className="topbar-right"><span className="chain-tag"><span className="monad-symbol">◈</span>{currentLocal ? `${t('Local EVM')} · Anvil` : ((path === "/" || path === "/evidence" || path === "/operations") && railDeployment.enabled ? railChain.name : chain.name)}</span>
          <div className="language-toggle" role="group" aria-label={t('Switch language')}><Languages size={14} aria-hidden="true" /><button type="button" lang="zh-CN" aria-label="切换为中文" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button><button type="button" lang="en" aria-label="Switch to English" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button></div>
          {path !== "/" && path !== "/verification" && path !== "/evidence" && path !== "/operations" && <button className="wallet-button" onClick={() => address ? disconnect() : connect({ connector: connectors[0] })} disabled={isPending || !connectors.length}><Wallet size={15} />{address ? shortAddress(address) : isPending ? t("Connecting…") : t("Connect wallet")}</button>}</div>
      </header>
      {error && path !== "/" && path !== "/verification" && path !== "/evidence" && path !== "/operations" && <div className="wallet-error" role="alert">{message(error.message.slice(0, 180))}. {t('Local demo borrowing is also available without an extension.')}</div>}
      <main>{children}</main>
      <footer className="main-footer"><span>{t("Built for the real economy.")}</span><span><span className="monad-symbol">◈</span> {t("Powered by Monad architecture ·")} {currentLocal ? t("local EVM execution") : t("testnet execution")}</span></footer>
    </div>
  </div>;
}

export function Shell({ children }: { children: React.ReactNode }) { return <Suspense fallback={<div className="page-loading">TradeRail…</div>}><ShellContent>{children}</ShellContent></Suspense>; }
