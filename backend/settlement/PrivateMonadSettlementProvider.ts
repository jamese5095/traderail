import type { SupplyChainEvent } from '../events';
import type { FinancialPosition, SettlementProvider } from './SettlementProvider';
import type { Hash } from 'viem';

/** Reserved adapter only. No SDK, encryption, private execution or integration is claimed. */
export class PrivateMonadSettlementProvider implements SettlementProvider {
  private unavailable(): never {
    throw new Error('Private settlement is not integrated. Use PublicMonadSettlementProvider. UI selective disclosure is a conceptual preview.');
  }
  async submitSupplyChainEvent(_event: SupplyChainEvent): Promise<Hash> { return this.unavailable(); }
  async getFinancialPosition(_shipmentId: string): Promise<FinancialPosition> { return this.unavailable(); }
  async executeRepay(_shipmentId: string, _amount: bigint): Promise<Hash> { return this.unavailable(); }
  async executeBorrow(_shipmentId: string, _amount: bigint): Promise<Hash> { return this.unavailable(); }
}
