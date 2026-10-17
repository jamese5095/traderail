'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import translations from './zh.json';
import evidenceTranslations from './evidence-zh.json';
import pitchTranslations from './pitch-zh.json';
import railTranslations from './rail-zh.json';

export type Locale = 'en' | 'zh';
type Params = Record<string, string | number>;
const dictionary: Record<string, string> = { ...translations, ...pitchTranslations, ...evidenceTranslations, ...railTranslations };
// Keep the established key so the TradeRail rename preserves language preferences.
const storageKey = 'flowstate.locale';
const validLocale = (value: unknown): value is Locale => value === 'en' || value === 'zh';
const statusNames: Record<string, string> = { NONE: 'Not received', RECEIVED: 'Received', COLLATERALIZED: 'Collateralized', OUTBOUND: 'Outbound', DELIVERED: 'Delivered', CLOSED: 'Closed' };
const eventNames: Record<string, string> = { ORDER_SETTLED: 'Buyer paid · principal settled', REPAID: 'Principal repaid', GOODS_RECEIVED: 'Goods received', BORROW: 'Stablecoin borrowed', GOODS_OUTBOUND: 'Goods outbound', DELIVERED: 'Delivery confirmed', INSPECTION_PASSED: 'Inspection passed' };
interface LocaleContextValue {
  locale: Locale;
  ready: boolean;
  hasPreference: boolean;
  setLocale: (locale: Locale) => void;
  t: (text: string, params?: Params) => string;
  statusLabel: (status: string) => string;
  eventLabel: (event: string) => string;
  actionLabel: (action: string) => string;
  message: (text: string) => string;
}
const Context = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, presentation=false }: { children: React.ReactNode; presentation?:boolean }) {
  // Match the server's first render, then restore this app's own preference.
  const [locale, updateLocale] = useState<Locale>('en');
  const [ready, setReady] = useState(false);
  const [hasPreference, setHasPreference] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (validLocale(saved)) { updateLocale(saved); setHasPreference(true); } } catch { /* Storage can be disabled; the toggle still works. */ }
    setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === storageKey && validLocale(event.newValue)) { updateLocale(event.newValue); setHasPreference(true); } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = presentation||window.location.pathname==='/pitch'?(locale==='zh'?'TradeRail · 项目介绍':'TradeRail · Project Pitch'):window.location.pathname==='/evidence'?(locale==='zh'?'TradeRail · 业务事件与链上证据':'TradeRail · Business events and onchain evidence'):locale === 'zh' ? 'TradeRail · Monad 贸易结算' : 'TradeRail · Trade Settlement on Monad';
  }, [locale,presentation]);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    setHasPreference(true);
    try { localStorage.setItem(storageKey, next); } catch { /* Optional persistence. */ }
  }, []);
  const value = useMemo<LocaleContextValue>(() => {
    const t = (text: string, params: Params = {}) => {
      const translated = locale === 'zh' ? dictionary[text] ?? text : text;
      return translated.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
    };
    const actionLabel = (action: string) => t(action);
    const message = (text: string) => {
      if (text.endsWith(' confirmed onchain')) return t('{action} confirmed onchain', { action: actionLabel(text.slice(0, -' confirmed onchain'.length)) });
      const supplier = text.match(/^Connect the registered supplier wallet: (0x[0-9a-fA-F]+)$/);
      if (supplier) return t('Connect the registered supplier wallet: {address}', { address: supplier[1] });
      return t(text);
    };
    return { locale, ready, hasPreference, setLocale, t, actionLabel, message,
      statusLabel: status => locale === 'zh' && statusNames[status] ? `${status} · ${t(statusNames[status])}` : status,
      eventLabel: event => locale === 'zh' && eventNames[event] ? `${event} · ${t(eventNames[event])}` : event.replaceAll('_', ' ') };
  }, [locale, ready, hasPreference, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLocale() {
  const context = useContext(Context);
  if (!context) throw new Error('useLocale requires LocaleProvider');
  return context;
}
