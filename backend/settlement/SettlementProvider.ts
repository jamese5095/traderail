import type { SupplyChainEvent } from '../events';
import type { Address, Hash } from 'viem';

export const statuses = ['NONE', 'RECEIVED', 'COLLATERALIZED', 'OUTBOUND', 'DELIVERED', 'CLOSED'] as const;
export interface FinancialPosition {
  shipmentId: string;
  supplier: Address;
  buyer: Address;
  orderAmount: bigint;
  buyerPaid: boolean;
  principalRepaid: bigint;
  supplierProceeds: bigint;
  verifiedInventoryValue: bigint;
  borrowingPower: bigint;
  outstandingDebt: bigint;
  availableCredit: bigint;
  quantity: bigint;
  status: typeof statuses[number];
}
export interface SettlementProvider {
  submitSupplyChainEvent(event: SupplyChainEvent): Promise<Hash>;
  getFinancialPosition(shipmentId: string): Promise<FinancialPosition>;
  executeBorrow(shipmentId: string, amount: bigint): Promise<Hash>;
  executeRepay(shipmentId: string, amount: bigint): Promise<Hash>;
}
