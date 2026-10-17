export type Status = 'NONE' | 'RECEIVED' | 'COLLATERALIZED' | 'OUTBOUND' | 'DELIVERED' | 'CLOSED';
export type EventType = 'GOODS_RECEIVED' | 'INSPECTION_PASSED' | 'GOODS_OUTBOUND' | 'DELIVERED';
export interface TimelineEntry {
  shipmentId?: string; logIndex?: number; eventId?: string; eventType: string; status: Status; hash: string; block: string; timestamp: number;
  before: { inventory: string; power: string; debt: string };
  after: { inventory: string; power: string; debt: string };
  amount: string; payment?: string; principal?: string; supplierProceeds?: string;
}
export interface Snapshot {
  position: { shipmentId: string; supplier: string; buyer: string; orderAmount: string; buyerPaid: boolean; principalRepaid: string; supplierProceeds: string; verifiedInventoryValue: string; borrowingPower: string; outstandingDebt: string; availableCredit: string; quantity: string; status: Status };
  supplierBalance: string; poolBalance: string; buyerBalance: string; guidedDemo: boolean; currentStep: 'receive' | 'borrow' | 'outbound' | 'deliver' | 'settle' | 'complete'; buyer?: string; protocolVersion?: number; demoOnly?: boolean; timeline: TimelineEntry[]; chainId: number; network: string;
  demoSigner: boolean; protocol: string; usdc: string; warehouse: string;
  readBlock: string; roundBorrowed: string; roundRepaid?: string; registration: { hash: string; block: string };
  rounds: { active: string; rounds: string[] }; archived: boolean; canStartRound: boolean;
}
export interface Evidence {
  hash: string; shipmentId: string; status: 'success' | 'reverted'; block: string; blockHash: string;
  chainId: number; network: string; from: string; to: string; gasUsed: string; confirmations: string;
  events: { address: string; name: string; args: Record<string, string | number>; logIndex: number }[];
  transfers: { address: string; name: string; args: Record<string, string | number>; logIndex: number }[];
  transition: TimelineEntry | null;
  positionAtBlock: Snapshot['position'] | null; balancesAtBlock: { supplierBalance: string; poolBalance: string; buyerBalance: string } | null;
  snapshotSource: 'rpc' | 'saved' | 'unavailable'; snapshotNote: string;
}
export const shortAddress = (address: string) => address.slice(0, 6) + '…' + address.slice(-4);
export const units = (value: string | undefined) => Number(BigInt(value ?? '0')) / 1e6;
export const money = (value: string | undefined) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(units(value));
