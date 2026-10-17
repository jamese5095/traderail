'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { chain, deployment } from '@backend/config/chain';
import type { Snapshot } from './types';
export type GuidedStep = 'receive' | 'borrow' | 'outbound' | 'deliver' | 'settle';
type Pending = { shipmentId: string; step: GuidedStep; hash?: string; eventId?: string; failed?: boolean };
// Retain the established namespace to recover pre-rename transactions safely.
const sessionKey = `flowstate:guided:${chain.id}:${deployment.protocol}:${deployment.deploymentBlock}:${(deployment as typeof deployment & { deploymentBlockHash?: string }).deploymentBlockHash ?? ''}`;
export function useGuidedDemo() {
  const params = useSearchParams();
  const router = useRouter();
  const home = usePathname() === "/legacy" ? "/legacy" : "/";
  const shipmentId = params.get('shipmentId') ?? '';
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState('idle');
  const [pending, setPending] = useState<Pending | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const [mode, setMode] = useState<'auto' | 'step'>('auto');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const locked = useRef(false);
  const submitting = useRef(false);
  const recovering = useRef(false);
  const routeRef = useRef(shipmentId); routeRef.current = shipmentId;
  const pendingRef = useRef<Pending | null>(null);
  const autoRef = useRef(false);
  const lastConfirmed = useRef(0);
  const persist = (value: Pending | null) => {
    pendingRef.current = value; setPending(value);
    try { if (value) localStorage.setItem(sessionKey, JSON.stringify(value)); else localStorage.removeItem(sessionKey); } catch { /* Recovery can still use the server journal. */ }
  };
  const stop = useCallback(() => { autoRef.current = false; setAutomatic(false); }, []);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/position${shipmentId ? `?shipmentId=${encodeURIComponent(shipmentId)}` : ''}`, { cache: 'no-store' });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Unable to read chain');
    if (alive.current && routeRef.current === shipmentId) setData(result as Snapshot); return result as Snapshot;
  }, [shipmentId]);
  const recover = useCallback(async () => {
    const work = pendingRef.current; if (!work || work.failed || submitting.current || recovering.current) return;
    const epoch = generation.current;
    let tracked = work;
    const current = () => alive.current && generation.current === epoch && pendingRef.current === tracked;
    recovering.current = true;
    try {
      const url = work.hash ? `/api/transaction?hash=${work.hash}` : work.eventId ? `/api/transaction?eventId=${encodeURIComponent(work.eventId)}` : `/api/demo/step?shipmentId=${encodeURIComponent(work.shipmentId)}&step=${work.step}`;
      const response = await fetch(url, { cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Unable to recover the original transaction');
      if (!current()) return;
      if (result.hash && !work.hash) { tracked = { ...work, hash: result.hash, eventId: result.eventId }; persist(tracked); }
      setState(result.state ?? 'unknown');
      if (result.state === 'confirmed') {
        await refresh(); if (!current()) return; lastConfirmed.current = Date.now(); persist(null); locked.current = false; setBusy(false); setError('');
      } else if (result.state === 'failed' || result.state === 'absent') {
        stop(); setBusy(false); setState('failed');
        if (tracked.hash) { tracked = { ...tracked, failed: true }; persist(tracked); locked.current = true; setError('The transaction reverted onchain. Its receipt is preserved; this step will not be resubmitted.'); }
        else { persist(null); locked.current = false; setError(result.error ?? 'No confirmed transaction. Review and retry this step.'); }
      } else if (result.state === 'unknown') { stop(); setError('The original transaction is still being checked. No next step will be sent.'); }
    } catch (e) { if (current()) { stop(); setState('unknown'); setError(e instanceof Error ? e.message : 'Unable to recover the original transaction'); } } finally { recovering.current = false; }
  }, [refresh, stop]);
  useEffect(() => {
    alive.current = true; ++generation.current; stop(); setData(null);
    try { const saved = JSON.parse(localStorage.getItem(sessionKey) ?? 'null'); if (saved?.shipmentId && saved?.step) { pendingRef.current = saved; setPending(saved); locked.current = true; setBusy(!saved.failed); setState(saved.failed ? 'failed' : 'confirming'); if (saved.failed) setError('The transaction reverted onchain. Its receipt is preserved; this step will not be resubmitted.'); } } catch { /* Invalid browser storage is ignored. */ }
    let reading = false;
    const poll = async () => { if (reading || submitting.current) return; reading = true; try { if (pendingRef.current && !pendingRef.current.failed) await recover(); else await refresh(); } catch (e) { if (alive.current) { stop(); setError(e instanceof Error ? e.message : 'Unable to read chain'); } } finally { reading = false; } };
    void poll(); const timer = setInterval(() => void poll(), 1800);
    return () => { alive.current = false; ++generation.current; autoRef.current = false; clearInterval(timer); };
  }, [refresh, recover, stop]);
  const execute = useCallback(async () => {
    if (locked.current || !data || data.archived || !data.guidedDemo || !data.currentStep || data.currentStep === 'complete') return;
    locked.current = true; submitting.current = true; setBusy(true); setError(''); setState('submitted');
    const work = { shipmentId: data.position.shipmentId, step: data.currentStep as GuidedStep };
    persist(work);
    try {
      const response = await fetch('/api/demo/step', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(work) });
      const result = await response.json();
      if (!alive.current) return;
      if (result.hash || result.eventId) persist({ ...work, hash: result.hash, eventId: result.eventId });
      if (!response.ok) throw new Error(result.error ?? 'Unable to submit this step');
      setState(result.state ?? 'confirming');
      if (result.state === 'unknown' || result.state === 'failed') stop();
      submitting.current = false; await recover();
    } catch (e) { if (alive.current) { stop(); setState('unknown'); setError(e instanceof Error ? e.message : 'Unable to submit this step'); } } finally { submitting.current = false; }
  }, [data, recover, stop]);
  useEffect(() => {
    if (!automatic || busy || !data || data.currentStep === 'complete' || error) return;
    const timer = setTimeout(() => { if (autoRef.current) void execute(); }, Math.max(0, 2400 - (Date.now() - lastConfirmed.current)));
    return () => clearTimeout(timer);
  }, [automatic, busy, data, error, execute]);
  const advance = () => { if (pendingRef.current) return; setError(''); if (mode === 'auto') { autoRef.current = true; setAutomatic(true); } else void execute(); };
  const selectRound = (id: string) => { if (busy) return; stop(); setData(null); setError(''); setState('idle'); router.replace(id ? `${home}?shipmentId=${encodeURIComponent(id)}` : home, { scroll: false }); };
  const startRound = async () => {
    if (!data || busy) return; stop(); locked.current = true; setBusy(true); setError('');
    try { const r = await fetch('/api/demo/round', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shipmentId: data.rounds.active }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setState('idle'); router.replace(home, { scroll: false }); if (!shipmentId) await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to start demo round'); }
    finally { locked.current = false; setBusy(false); }
  };
  return { data, error, state, pending, busy, automatic, mode, setMode: (next: 'auto' | 'step') => { stop(); setMode(next); }, advance, pause: stop, recover, selectRound, startRound };
}
