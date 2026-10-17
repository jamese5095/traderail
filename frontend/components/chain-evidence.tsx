'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, ExternalLink, ShieldCheck, ArrowRight } from 'lucide-react';
import { explorerUrl, isLocal } from '@backend/config/chain';
import { useLocale } from '@/lib/i18n/locale';
import { money, shortAddress, type Evidence, type Snapshot } from '@/lib/types';

export function ChainEvidence({ data, busy, submittedHash, failure = '', hidden = false, selectedHash, onSelectHash }: { data: Snapshot | null; busy: string; submittedHash: string; failure?: string; hidden?: boolean; selectedHash: string; onSelectHash: (hash: string) => void }) {
  const { t, eventLabel } = useLocale();
  const [proof, setProof] = useState<Evidence | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const latestHash = data?.timeline.at(-1)?.hash ?? data?.registration.hash ?? '';
  const hash = selectedHash && (data?.timeline.some(entry => entry.hash === selectedHash) || data?.registration.hash === selectedHash) ? selectedHash : latestHash;
  const shipmentId = data?.position.shipmentId;
  useEffect(() => {
    setProof(null); setError('');
    if (!hash || !shipmentId) return;
    const controller = new AbortController();
    fetch(`/api/evidence?shipmentId=${encodeURIComponent(shipmentId)}&hash=${hash}`, { cache: 'no-store', signal: controller.signal }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); if (!controller.signal.aborted) setProof(value); }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to verify receipt'); });
    return () => controller.abort();
  }, [hash, shipmentId]);
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setCopied(value); } catch { setCopied(''); } };
  const number = (value: string) => hidden ? t('PRIVATE') : `$${money(value)}`;
  const transition = proof?.transition;
  const role = (address: string) => { const key = address.toLowerCase(); if (key === data?.position.buyer?.toLowerCase()) return t('Buyer'); if (key === data?.position.supplier.toLowerCase()) return t('Supplier'); if (key === data?.protocol.toLowerCase()) return t('Funding pool'); return shortAddress(address); }; 
  return <section className="panel chain-evidence" aria-label={t('Onchain evidence')}>
    <div className="panel-heading"><h2><ShieldCheck size={18} />{t('Onchain evidence')}</h2><span className="evidence-badge">{busy ? t('Awaiting confirmation') : failure ? t('Action not confirmed') : error ? t('Verification unavailable') : proof ? t('RPC verified') : t('Verifying receipt…')}</span></div>

    <div className="evidence-board"><div className="evidence-transaction"><h3>{t('Transaction receipt')}</h3>
    {data && <label className="evidence-selector"><span>{t('Transaction to verify')}</span><select value={hash} onChange={event => onSelectHash(event.target.value)}><option value={data.registration.hash}>{t('Shipment registration')} · #{data.registration.block}</option>{data.timeline.map(entry => <option value={entry.hash} key={entry.hash}>{eventLabel(entry.eventType)} · #{entry.block}</option>)}</select></label>}
    {busy && <p className="evidence-pending" role="status">{t('Waiting for a confirmed receipt. Displayed values remain the last confirmed chain state.')}{submittedHash && <code>{submittedHash}</code>}</p>}
    {error && <p className="evidence-error" role="alert">{error}</p>}
    {failure && <p className="evidence-error">{t('Action not confirmed')}: {t(failure)}</p>}
    {proof && <>
      <div className="receipt-strip"><CheckCircle2 size={16} /><strong>{t(proof.status === 'success' ? 'Confirmed receipt' : 'Transaction reverted')}</strong><span>{t('Block')} {proof.block}</span><span>{proof.confirmations} {t('confirmations at verification')}</span></div>
      <div className="evidence-hash"><code title={proof.hash}>{shortAddress(proof.hash)}</code><button aria-label={t('Copy transaction hash')} onClick={() => void copy(proof.hash)}>{copied === proof.hash ? <CheckCircle2 size={14} /> : <Copy size={14} />}</button><a href={explorerUrl ? `${explorerUrl}/tx/${proof.hash}` : `/api/evidence?shipmentId=${encodeURIComponent(proof.shipmentId)}&hash=${proof.hash}`} target="_blank" rel="noreferrer">{t(explorerUrl ? 'View transaction' : 'Open verified receipt')}<ExternalLink size={13} /></a></div>
    </>}
    </div><div className="evidence-result"><h3>{t('Selected transaction · financial changes')}</h3>
    {proof && <>
      {transition?.eventType === 'ORDER_SETTLED' && <div className="settlement-receipt-summary">{t('Buyer payment')} {number(transition.payment ?? transition.amount)} · {t('Principal repayment')} {number(transition.principal ?? '0')} · {t('Remaining order proceeds')} {number(transition.supplierProceeds ?? '0')}</div>}
      {transition && <div className="evidence-changes">{[['Borrowing power', 'power'], ['Outstanding debt', 'debt']].map(([label, field]) => <div key={field}><span>{t(label)}</span><span>{number(transition.before[field as 'power' | 'debt'])}<ArrowRight size={13} /><strong>{number(transition.after[field as 'power' | 'debt'])}</strong></span></div>)}<div><span>{t('Available credit')}</span><span>{number(String(BigInt(transition.before.power) > BigInt(transition.before.debt) ? BigInt(transition.before.power) - BigInt(transition.before.debt) : 0n))}<ArrowRight size={13} /><strong>{number(String(BigInt(transition.after.power) > BigInt(transition.after.debt) ? BigInt(transition.after.power) - BigInt(transition.after.debt) : 0n))}</strong></span></div></div>}
      <div className="transfer-proof">{proof.transfers.length ? proof.transfers.map(transfer => <div key={transfer.logIndex}><strong>Transfer · {hidden ? t('PRIVATE') : `${money(String(transfer.args.amount))} MockUSDC`}</strong><span>{hidden ? t('PRIVATE') : `${role(String(transfer.args.from))} → ${role(String(transfer.args.to))}`}</span></div>) : <span>{t('This receipt contains no supplier stablecoin transfer.')}</span>}</div>
    </>}
    {data && <details className="receipt-details"><summary>{t('Current shipment totals · not the selected transaction')}</summary><div className="round-wallet-proof"><span>{t('This round received')}<strong>{number(data.roundBorrowed)} mock USDC</strong></span><span>{t('Supplier wallet · all rounds')}<strong>{number(data.supplierBalance)} mock USDC</strong></span></div></details>}
    </div></div>
    {proof && proof.snapshotSource !== 'rpc' && <p className="snapshot-provenance" role="status">{t(proof.snapshotSource === 'saved' ? 'Saved confirmed-block snapshot (block identity verified)' : 'Historical balance snapshot unavailable; transaction events and transfers remain verifiable.')}</p>}
    <details className="receipt-details evidence-context"><summary>{t('Network & contracts')}</summary>
    <div className="evidence-network"><strong>{data?.network ?? '—'}</strong><span>Chain ID {data?.chainId ?? '—'}</span><span>{t('Live state read at block')} {data?.readBlock ?? '—'}</span></div>
    {isLocal && <p className="evidence-local-note">{t('Real local EVM execution. Public explorer verification requires a Monad Testnet deployment.')}</p>}
    <div className="evidence-addresses">{[['Protocol', data?.protocol], ['Mock USDC', data?.usdc]].map(([label, address]) => <div key={label}><span>{t(label!)}</span><code title={address}>{address ?? '—'}</code>{address && <button aria-label={t('Copy address')} onClick={() => void copy(address)}>{copied === address ? <CheckCircle2 size={13} /> : <Copy size={13} />}</button>}{address && explorerUrl && <a href={`${explorerUrl}/address/${address}`} target="_blank" rel="noreferrer" aria-label={t('View contract')}><ExternalLink size={13} /></a>}</div>)}</div>
    </details>
    {proof && <details className="receipt-details"><summary>{t('Inspect decoded event logs and block snapshot')}</summary><p>{t(proof.snapshotSource === 'saved' ? 'Saved confirmed-block snapshot (block identity verified)' : proof.snapshotSource === 'unavailable' ? 'Historical balance snapshot unavailable; transaction events and transfers remain verifiable.' : 'Historical state read directly from the receipt block.')}</p>{proof.snapshotNote && <p>{t(proof.snapshotNote)}</p>}<pre>{JSON.stringify(hidden ? { hash: proof.hash, block: proof.block, status: proof.status, events: proof.events.map(event => event.name) } : { snapshotSource: proof.snapshotSource, snapshotNote: proof.snapshotNote, blockHash: proof.blockHash, from: proof.from, to: proof.to, gasUsed: proof.gasUsed, events: proof.events, positionAtBlock: proof.positionAtBlock, balancesAtBlock: proof.balancesAtBlock }, null, 2)}</pre></details>}
    <Link className="evidence-download" href={`/api/position${shipmentId ? `?shipmentId=${encodeURIComponent(shipmentId)}` : ''}`} target="_blank">{t('Open raw chain snapshot')}<ExternalLink size={12} /></Link>
  </section>;
}
