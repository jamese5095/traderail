'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Snapshot, EventType } from './types';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { formatUnits, keccak256, parseUnits, stringToHex, type Abi, type Address } from 'viem';
import { chain, deployment } from '@backend/config/chain';
import protocolAbi from './protocol-abi.json';
import usdcAbi from './usdc-abi.json';
export type TransactionState = 'idle' | 'signing' | 'submitted' | 'confirming' | 'confirmed' | 'failed' | 'unknown';

export function useDemo() {
  const { address, chainId } = useAccount();
  const walletPublic = usePublicClient({ chainId: chain.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [transactionState, setTransactionState] = useState<TransactionState>('idle');
  const running = useRef(false);
  const workActive = useRef(false);
  // Retain the established namespace to recover pre-rename transactions safely.
  const storageKey = `flowstate:${chain.id}:${deployment.protocol}:${deployment.deploymentBlock}:${(deployment as typeof deployment & { deploymentBlockHash?: string }).deploymentBlockHash ?? 'legacy'}:pending`;
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [token, setToken] = useState('');
  const selectedRound = params.get('shipmentId') ?? '';
  const [submittedHash, setSubmittedHash] = useState('');
  const selectedRoundRef = useRef(selectedRound);
  selectedRoundRef.current = selectedRound;
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const positionRequest = useRef<{ round: string; controller: AbortController; promise: Promise<void> } | null>(null);
  const cancelPositionRequest = useCallback(() => {
    ++requestVersion.current;
    positionRequest.current?.controller.abort();
    positionRequest.current = null;
  }, []);
  const refresh = useCallback((): Promise<void> => {
    if (!mounted.current || selectedRoundRef.current !== selectedRound) return Promise.resolve();
    const current = positionRequest.current;
    // Slow RPC calls must be allowed to finish: polling and actions share one request.
    if (current?.round === selectedRound && !current.controller.signal.aborted) return current.promise;
    if (current) cancelPositionRequest();
    const version = ++requestVersion.current;
    const controller = new AbortController();
    const promise = (async () => {
      try {
        const r = await fetch('/api/position' + (selectedRound ? `?shipmentId=${encodeURIComponent(selectedRound)}` : ''), { cache: 'no-store', signal: controller.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Unable to read chain');
        if (mounted.current && !controller.signal.aborted && version === requestVersion.current) { setData(j); setLoadError(''); }
      } catch (e) {
        if (mounted.current && !controller.signal.aborted && version === requestVersion.current) setLoadError(e instanceof Error ? e.message : 'Unable to read chain');
      } finally {
        if (positionRequest.current?.controller === controller) positionRequest.current = null;
      }
    })();
    positionRequest.current = { round: selectedRound, controller, promise };
    return promise;
  }, [selectedRound, cancelPositionRequest]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => { mounted.current = false; clearInterval(timer); cancelPositionRequest(); };
  }, [refresh, cancelPositionRequest]);

  const track = useCallback(async (hash: string, label: string) => {
    setSubmittedHash(hash); setTransactionState('confirming');
    try {
      const response = await fetch(`/api/transaction?hash=${hash}`, { cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setTransactionState(result.state);
      if (result.state === 'confirmed' || result.state === 'failed') {
        localStorage.removeItem(storageKey); running.current = false; setBusy('');
        if (result.state === 'confirmed') { setNotice(`${label} confirmed onchain`); setActionError(''); }
        else setActionError('Transaction reverted onchain');
        await refresh();
      } else { setBusy(label); running.current = true; }
    } catch { setTransactionState('unknown'); setNotice('Transaction outcome unknown. Tracking the original hash; do not resubmit.'); }
  }, [refresh, storageKey]);
  useEffect(() => {
    const resume = () => {
      try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (saved?.hash && !workActive.current) void track(saved.hash, saved.label); else if (!saved && localStorage.getItem(`${storageKey}:request`) && !workActive.current) { setTransactionState('unknown'); setNotice('Unresolved submission saved. Recovering its original receipt.');
        const request = JSON.parse(localStorage.getItem(`${storageKey}:request`) ?? '{}');
        if (request.body?.eventId) void fetch(`/api/transaction?eventId=${encodeURIComponent(request.body.eventId)}`, { cache: 'no-store' }).then(r => r.json()).then(result => {
          if (result.hash) { localStorage.removeItem(`${storageKey}:request`); localStorage.setItem(storageKey, JSON.stringify({ hash: result.hash, label: request.body.eventType ?? request.path.split('/').at(-1).toUpperCase() })); void track(result.hash, request.body.eventType ?? 'TRANSACTION'); }
          else if (result.state === 'failed') { localStorage.removeItem(`${storageKey}:request`); setTransactionState('failed'); setActionError(result.error ?? 'Preflight rejected; no transaction submitted'); }
        }).catch(() => {}); } }
      catch { /* Invalid local recovery state is ignored. */ }
    };
    resume(); const timer = setInterval(resume, 2500); return () => clearInterval(timer);
  }, [track, storageKey]);

  const run = useCallback(async (label: string, work: (onSubmitted: (hash: string) => void) => Promise<unknown>) => {
    if (running.current) return;
    running.current = true; workActive.current = true;
    setBusy(label); setActionError(''); setNotice(''); setSubmittedHash(''); setTransactionState('signing');
    let hash = '';
    const submitted = (value: string) => {
      hash = value; setSubmittedHash(value); setTransactionState('submitted');
      localStorage.setItem(storageKey, JSON.stringify({ hash: value, label }));
    };
    try {
      const result = await work(submitted);
      if (result && typeof result === 'object' && 'hash' in result && typeof result.hash === 'string') submitted(result.hash);
      if (result && typeof result === 'object' && 'state' in result && result.state === 'failed' && !hash) throw new Error('Preflight rejected; no transaction submitted');
      if (hash) { await track(hash, label); }
      else if (result && typeof result === 'object' && 'state' in result && result.state === 'unknown') {
        setTransactionState('unknown'); setActionError('Submission outcome unknown. The original event ID is preserved; automatic resend is blocked.');
      } else { setTransactionState('confirmed'); await refresh(); setNotice(`${label} confirmed onchain`); }
    } catch (e) {
      if (hash) { setTransactionState('unknown'); setNotice('Transaction outcome unknown. Tracking the original hash; do not resubmit.'); const recoveryLabel = JSON.parse(localStorage.getItem(storageKey) ?? '{}').label ?? label; await track(hash, recoveryLabel); if (recoveryLabel.startsWith('TOKEN APPROVAL')) setActionError(`Repayment has not been submitted. ${e instanceof Error ? e.message : 'Check approval and retry repayment.'}`); }
      else { const unknown = localStorage.getItem(`${storageKey}:request`) !== null; setTransactionState(unknown ? 'unknown' : 'failed'); setActionError(unknown ? 'Submission outcome unknown. Retry resumes the original business event; do not create another action.' : e instanceof Error ? e.message : 'Transaction failed before submission'); }
    } finally { workActive.current = false; if (!hash) { running.current = false; setBusy(''); } }
  }, [refresh, storageKey, track]);

  const stableId = (action: string) => {
    const key = `${storageKey}:${data?.position.shipmentId}:${action}`;
    let id = localStorage.getItem(key); if (!id) { id = crypto.randomUUID(); localStorage.setItem(key,id); } return id;
  };
  const post = async (path: string, body: unknown) => {
    const key = `${storageKey}:request`;
    const previous = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (previous && previous.path !== path) throw new Error('Resume the unresolved original action before another submission');
    const pending = previous ?? { path, body };
    localStorage.setItem(key, JSON.stringify(pending));
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(pending.body) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status < 500 && !String(result.error).includes('unknown')) localStorage.removeItem(key);
      throw new Error(result.error ?? 'Submission rejected');
    }
    if (result.hash || ['confirmed', 'failed'].includes(result.state)) localStorage.removeItem(key);
    return result;
  };
  const sendEvent = (eventType: EventType) => run(eventType.replaceAll('_', ' '), async () => {
    if (!data || data.archived) throw new Error('Return to the active demo round before submitting');
    return post('/api/events', { eventId: stableId(eventType), eventType, shipmentId: data.position.shipmentId, source: 'Shanghai Demo Warehouse',
      ...(eventType === 'GOODS_RECEIVED' ? { sku: 'SKU-001', quantity: 100, declaredValue: 100000 } : {}) });
  });
  const finance = (action: 'borrow' | 'repay', supplied?: string) => run(action === 'borrow' ? 'BORROW 50,000 USDC' : 'REPAY', async onSubmitted => {
    if (!data || data.archived) throw new Error('Return to the active demo round before submitting');
    const amount = action === 'borrow' ? '50000' : supplied ?? formatUnits(BigInt(data.position.outstandingDebt),6);
    const value = parseUnits(amount,6); if (value <= 0n) throw new Error('Amount must be positive');
    if (address) {
      if (address.toLowerCase() !== deployment.supplier.toLowerCase()) throw new Error(`Connect the registered supplier wallet: ${deployment.supplier}`);
      if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
      if (action === 'repay') {
        const approval = await writeContractAsync({ address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'approve', args: [deployment.protocol, value], chainId: chain.id });
        onSubmitted(approval);
        localStorage.setItem(storageKey, JSON.stringify({ hash: approval, label: 'TOKEN APPROVAL (repayment still requires signature)' }));
        setNotice('Approval submitted. Waiting before repayment signature.');
        // An approval is not repayment: never report it as a completed financial action.
        const receipt = await walletPublic!.waitForTransactionReceipt({ hash: approval });
        if (receipt.status !== 'success') throw new Error('Token approval reverted');
      }
      const hash = await writeContractAsync({ address: deployment.protocol as Address, abi: protocolAbi as Abi, functionName: action, args: [keccak256(stringToHex(data.position.shipmentId)), value], chainId: chain.id });
      onSubmitted(hash); return { hash };
    }
    if (!data.demoSigner) throw new Error('Connect the supplier wallet on Monad Testnet');
    return post(`/api/${action}`, { eventId: stableId(`${action}:${amount}:${data.position.outstandingDebt}:${data.timeline.length}`), shipmentId: data.position.shipmentId, amount });
  });
  const borrow = () => finance('borrow');
  const repay = (amount?: string) => finance('repay',amount);
  const startRound = async () => {
    if (!data) return;
    setBusy('NEW DEMO ROUND'); setActionError(''); setNotice(''); setSubmittedHash('');
    try {
      const r = await fetch('/api/demo/round', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ shipmentId: data.rounds.active }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      cancelPositionRequest();
      selectedRoundRef.current = '';
      setData(null);
      router.replace(pathname, { scroll: false });
      // A changed route starts its own request; an unchanged active-round route refreshes here.
      if (!selectedRound) await refresh();
      setNotice('New demo round ready. Previous onchain history is preserved.');
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Unable to start demo round'); }
    finally { setBusy(''); }
  };
  const selectRound = (shipmentId: string) => {
    cancelPositionRequest(); selectedRoundRef.current = shipmentId; setData(null); setActionError(''); setNotice(''); setSubmittedHash('');
    const query = new URLSearchParams(params.toString());
    query.delete('tx');
    if (shipmentId) query.set('shipmentId', shipmentId); else query.delete('shipmentId');
    router.replace(pathname + (query.size ? `?${query}` : ''), { scroll: false });
  };
  return { data, error: actionError || loadError, actionError, connectionError: loadError, busy, notice, submittedHash, transactionState, token, setToken, refresh, run, sendEvent, borrow, repay, startRound, selectRound };
}
