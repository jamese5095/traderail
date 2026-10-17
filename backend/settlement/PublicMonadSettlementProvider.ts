import 'server-only';
import { history } from './history';
import { ApiError } from '../http';
import { isOrderProtocol, orderDeployment } from '../config/v2';
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, type Abi, type Address, type Hash, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chain, deployment, rpcUrl, isLocal } from '../config/chain';
import protocolAbi from '../../frontend/lib/protocol-abi.json';
import usdcAbi from '../../frontend/lib/usdc-abi.json';
import type { SupplyChainEvent } from '../events';
import { statuses, type FinancialPosition, type SettlementProvider } from './SettlementProvider';

const protocol = deployment.protocol as Address;
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl), batch: { multicall: false } });
const hashId = (id: string) => keccak256(stringToHex(id));

// Only reachable through server routes. Never bundled into the browser.
function warehouseSigner() {
  const key = process.env.WAREHOUSE_PRIVATE_KEY ?? (isLocal ? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' : undefined);
  if (!key) throw new Error('WAREHOUSE_PRIVATE_KEY is required on testnet');
  const account = privateKeyToAccount(key as Hex);
  if (account.address.toLowerCase() !== deployment.warehouse.toLowerCase()) throw new Error('Warehouse signer does not match contract deployment');
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

export class PublicMonadSettlementProvider implements SettlementProvider {
  private async confirmed(hash: Hash): Promise<Hash> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error('Settlement transaction reverted');
    return hash;
  }

  async submitSupplyChainEvent(event: SupplyChainEvent): Promise<Hash> {
    if (event.eventType === 'DELIVERED' && isOrderProtocol) throw new ApiError('Buyer signature required. Use guided buyer delivery or the registered buyer wallet.', 403);
    const wallet = warehouseSigner();
    const eventId = hashId(event.eventId);
    const seen = await publicClient.readContract({ address: protocol, abi: protocolAbi as Abi, functionName: 'processedEvents', args: [eventId] });
    if (seen) throw new ApiError('Event already processed', 409);
    const id = hashId(event.shipmentId);
    let functionName: string;
    let args: readonly unknown[];
    switch (event.eventType) {
      case 'GOODS_RECEIVED': functionName = 'recordGoodsReceived'; args = [id, eventId, event.declaredValue, BigInt(event.quantity)]; break;
      case 'INSPECTION_PASSED': functionName = 'recordInspectionPassed'; args = [id, eventId]; break;
      case 'GOODS_OUTBOUND': functionName = 'recordGoodsOutbound'; args = [id, eventId]; break;
      case 'DELIVERED': functionName = 'recordDelivery'; args = [id, eventId]; break;
    }
    const { request } = await publicClient.simulateContract({ account: wallet.account, address: protocol, abi: protocolAbi as Abi, functionName, args }).catch(error => { throw new ApiError(`Preflight rejected; no transaction submitted: ${error.shortMessage ?? error.message}`, 409); });
    return wallet.writeContract(request);
  }

  async getFinancialPosition(shipmentId: string, blockNumber?: bigint): Promise<FinancialPosition> {
    const p = await publicClient.readContract({ address: protocol, abi: protocolAbi as Abi, functionName: 'getPosition', args: [hashId(shipmentId)], blockNumber }) as {
      supplier: Address; buyer: Address; orderAmount: bigint; buyerPaid: boolean; principalRepaid: bigint; supplierProceeds: bigint; verifiedInventoryValue: bigint; borrowingPower: bigint; outstandingDebt: bigint; quantity: bigint; status: number;
    };
    return { shipmentId, supplier: p.supplier, buyer: p.buyer ?? ('0x0000000000000000000000000000000000000000' as Address), orderAmount: p.orderAmount ?? 0n, buyerPaid: p.buyerPaid ?? false, principalRepaid: p.principalRepaid ?? 0n, supplierProceeds: p.supplierProceeds ?? 0n, verifiedInventoryValue: p.verifiedInventoryValue, borrowingPower: p.borrowingPower,
      outstandingDebt: p.outstandingDebt, availableCredit: p.borrowingPower > p.outstandingDebt ? p.borrowingPower - p.outstandingDebt : 0n,
      quantity: p.quantity, status: statuses[p.status] };
  }

  async executeBorrow(shipmentId: string, amount: bigint): Promise<Hash> {
    // Public networks ALWAYS require the supplier wallet to sign in the frontend.
    if (!isLocal || process.env.DEMO_SIGNER_ENABLED !== 'true') throw new Error('Server borrow is only enabled in local demo mode. Connect the supplier wallet.');
    const account = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const { request } = await publicClient.simulateContract({ account, address: protocol, abi: protocolAbi as Abi, functionName: 'borrow', args: [hashId(shipmentId), amount] }).catch(error => { throw new ApiError(`Preflight rejected; no transaction submitted: ${error.shortMessage ?? error.message}`, 409); });
    return wallet.writeContract(request);
  }

  async registerLocalShipment(shipmentId: string) {
    if (!isLocal || process.env.DEMO_SIGNER_ENABLED !== 'true') throw new Error('Local demo registration is disabled');
    const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const owner = await publicClient.readContract({ address: protocol, abi: protocolAbi as Abi, functionName: 'owner' }) as Address;
    if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error('Local demo owner does not match deployment');
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const { request } = await publicClient.simulateContract({ account, address: protocol, abi: protocolAbi as Abi, functionName: isOrderProtocol ? 'registerOrder' : 'registerShipment', args: isOrderProtocol ? [hashId(shipmentId), deployment.supplier, orderDeployment.buyer, 100_000_000_000n] : [hashId(shipmentId), deployment.supplier] }).catch(error => { throw new ApiError(`Preflight rejected; no transaction submitted: ${error.shortMessage ?? error.message}`, 409); });
    return this.confirmed(await wallet.writeContract(request));
  }

  async registration(shipmentId: string, blockNumber: bigint) {
    const index = await history(publicClient, blockNumber);
    const log = index.logs.find(log => log.eventName === 'ShipmentRegistered' && log.args.shipmentId === hashId(shipmentId));
    if (log) return { hash: log.transactionHash, block: String(log.blockNumber) };
    throw new Error('No confirmed shipment registration found');
  }

  async balances(blockNumber?: bigint) {
    const [supplierBalance, poolBalance, buyerBalance] = await Promise.all([
      publicClient.readContract({ address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'balanceOf', args: [deployment.supplier], blockNumber }),
      publicClient.readContract({ address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'balanceOf', args: [protocol], blockNumber }),
      orderDeployment.buyer ? publicClient.readContract({ address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'balanceOf', args: [orderDeployment.buyer], blockNumber }) : Promise.resolve(0n)
    ]);
    return { supplierBalance: supplierBalance as bigint, poolBalance: poolBalance as bigint, buyerBalance: buyerBalance as bigint };
  }

  async timeline(shipmentId = 'SHIP-001', blockNumber?: bigint) {
    const head = blockNumber ?? await publicClient.getBlockNumber({ cacheTime: 0 });
    const index = await history(publicClient, head);
    const logs = index.logs.filter(log => log.args.shipmentId === hashId(shipmentId) && log.blockNumber <= head);
    const names: Record<string, string> = { GoodsReceived: 'GOODS_RECEIVED', InspectionPassed: 'INSPECTION_PASSED', Borrowed: 'BORROW', GoodsOutbound: 'GOODS_OUTBOUND', Delivered: 'DELIVERED', Repaid: 'REPAID', OrderSettled: 'ORDER_SETTLED' };
    let previous = { inventory: '0', power: '0', debt: '0' };
    return logs.filter(log => names[log.eventName]).map(log => {
      const state = logs.find(next => next.transactionHash === log.transactionHash && next.logIndex > log.logIndex && next.eventName === 'FinancialStateChanged');
      if (!state) throw new Error('Financial event has no matching state transition');
      const a = state.args;
      const after = { inventory: String(a.verifiedInventoryValue), power: String(a.borrowingPower), debt: String(a.outstandingDebt) };
      const entry = { eventType: names[log.eventName], shipmentId, logIndex: log.logIndex, eventId: log.args.eventId,
        status: statuses[Number(a.status)], hash: log.transactionHash, block: String(log.blockNumber), timestamp: Number(index.times[String(log.blockNumber)]),
        before: previous, after, amount: String(log.args.payment ?? log.args.amount ?? 0n),
        ...(log.eventName === 'OrderSettled' ? { payment: String(log.args.payment), principal: String(log.args.principal), supplierProceeds: String(log.args.supplierProceeds) } : {}) };
      previous = after; return entry;
    });
  }

  async executeRepay(shipmentId: string, amount: bigint): Promise<Hash> {
    if (!isLocal || process.env.DEMO_SIGNER_ENABLED !== 'true') throw new Error('Use supplier wallet on public networks');
    const account = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
    const approval = await publicClient.simulateContract({ account, address: deployment.usdc as Address, abi: usdcAbi as Abi, functionName: 'approve', args: [protocol, amount] }).catch(error => { throw new ApiError(`Preflight rejected; no transaction submitted: ${error.shortMessage ?? error.message}`, 409); });
    await this.confirmed(await wallet.writeContract(approval.request));
    const { request } = await publicClient.simulateContract({ account, address: protocol, abi: protocolAbi as Abi, functionName: 'repay', args: [hashId(shipmentId), amount] }).catch(error => { throw new ApiError(`Preflight rejected; no transaction submitted: ${error.shortMessage ?? error.message}`, 409); });
    return wallet.writeContract(request);
  }
}
export const settlement = new PublicMonadSettlementProvider();
