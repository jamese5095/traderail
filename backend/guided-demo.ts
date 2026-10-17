import 'server-only';
import { createWalletClient, http, keccak256, stringToHex, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chain, deployment, rpcUrl } from './config/chain';
import { isOrderProtocol, orderDeployment } from './config/v2';
import { ApiError, requireLocalOrigin } from './http';
import { publicClient, settlement } from './settlement/PublicMonadSettlementProvider';
import type { FinancialPosition } from './settlement/SettlementProvider';
import protocolAbi from '../frontend/lib/protocol-abi.json';
import usdcAbi from '../frontend/lib/usdc-abi.json';

export const guidedSteps = ['receive', 'borrow', 'outbound', 'deliver', 'settle'] as const;
export type GuidedStep = typeof guidedSteps[number];
const roles = { warehouse: ['WAREHOUSE_PRIVATE_KEY', deployment.warehouse], supplier: ['SUPPLIER_PRIVATE_KEY', deployment.supplier], buyer: ['BUYER_PRIVATE_KEY', orderDeployment.buyer] } as const;
const amount = 100_000_000_000n;

function roleAccount(role: keyof typeof roles) {
  const [variable, expected] = roles[role];
  const key = process.env[variable];
  if (!expected || !/^0x[0-9a-fA-F]{40}$/.test(expected) || !key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new ApiError(`Guided demo ${role} signer is not configured`,503);
  let account;
  try { account = privateKeyToAccount(key as Hex); } catch { throw new ApiError(`Guided demo ${role} signer is invalid`,503); }
  if (account.address.toLowerCase() !== expected.toLowerCase()) throw new ApiError(`Guided demo ${role} signer does not match deployment`,503);
  return account;
}
export function authorizeGuidedDemo(request: Request) {
  if (process.env.GUIDED_DEMO_ENABLED !== 'true' || ![31337,10143].includes(chain.id) || !isOrderProtocol || orderDeployment.demoOnly !== true || !/^0x[0-9a-fA-F]{64}$/.test(orderDeployment.deploymentBlockHash ?? '')) throw new ApiError('Guided demo signing is disabled',403);
  requireLocalOrigin(request);
  for (const role of Object.keys(roles) as (keyof typeof roles)[]) roleAccount(role);
}
export function guidedDemoAvailable(request: Request) { try { authorizeGuidedDemo(request); return true; } catch { return false; } }
export function guidedEventId(shipmentId: string, step: GuidedStep) {
  return `guided-${keccak256(stringToHex([chain.id, deployment.protocol.toLowerCase(), orderDeployment.deploymentBlockHash, shipmentId, step].join(':')))}`;
}
export function currentGuidedStep(p: FinancialPosition): GuidedStep | 'complete' {
  if (p.status === 'CLOSED' && p.buyerPaid) return 'complete';
  return ({ NONE: 'receive', RECEIVED: 'borrow', COLLATERALIZED: 'outbound', OUTBOUND: 'deliver', DELIVERED: 'settle', CLOSED: 'settle' } as const)[p.status];
}

/** Only these five predeclared test transactions are reachable; this is not a signing/broadcast proxy. */
export async function executeGuidedStep(shipmentId: string, step: GuidedStep, eventId: string) {
  const [actualChain, anchor, position] = await Promise.all([
    publicClient.getChainId(), publicClient.getBlock({ blockNumber: BigInt(deployment.deploymentBlock) }), settlement.getFinancialPosition(shipmentId),
  ]);
  if (actualChain !== chain.id || anchor.hash?.toLowerCase() !== orderDeployment.deploymentBlockHash?.toLowerCase()) throw new ApiError('Guided demo deployment identity does not match the connected chain',409);
  if (position.supplier.toLowerCase() !== deployment.supplier.toLowerCase() || position.buyer.toLowerCase() !== orderDeployment.buyer?.toLowerCase() || position.orderAmount !== amount) throw new ApiError('Guided demo requires the fixed registered supplier, buyer and 100,000 MockUSDC order',409);
  if (currentGuidedStep(position) !== step) throw new ApiError(`Current order requires ${currentGuidedStep(position)}; ${step} was not submitted`,409);
  const role = step === 'borrow' ? 'supplier' : step === 'deliver' || step === 'settle' ? 'buyer' : 'warehouse';
  const account = roleAccount(role);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const id = keccak256(stringToHex(shipmentId)), eid = keccak256(stringToHex(eventId));
  const calls = {
    receive: { functionName: 'recordGoodsReceived', args: [id,eid,amount,100n] },
    borrow: { functionName: 'borrow', args: [id,50_000_000_000n] },
    outbound: { functionName: 'recordGoodsOutbound', args: [id,eid] },
    deliver: { functionName: 'recordDelivery', args: [id,eid] },
    settle: { functionName: 'settleOrder', args: [id] },
  };
  if (step === 'borrow' && (position.outstandingDebt !== 0n || position.principalRepaid !== 0n)) throw new ApiError('Guided borrowing is available only once for a fresh order',409);
  if (step === 'settle') {
    const allowance = await publicClient.readContract({ address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'allowance', args: [account.address,deployment.protocol] }) as bigint;
    if (allowance < amount) throw new ApiError('Buyer payment allowance is not prepared. Configure the demo buyer approval before this step; no transaction submitted.',409);
    const balance = await publicClient.readContract({ address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'balanceOf', args: [account.address] }) as bigint;
    if (balance < amount) throw new ApiError('Demo buyer requires 100,000 MockUSDC for this order; no transaction submitted.',409);
  }
  const { request } = await publicClient.simulateContract({ account, address: deployment.protocol as Address, abi: protocolAbi as Abi, ...calls[step] }).catch(error => { throw new ApiError(`Guided preflight rejected; no transaction submitted: ${error.shortMessage ?? 'contract simulation failed'}`,409); });
  // Any failure after this point is an unknown broadcast outcome, never a preflight rejection.
  return wallet.writeContract(request);
}
