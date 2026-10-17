import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { parseUnits } from 'viem';

const base = z.object({
  eventId: z.string().min(1).max(128).optional(),
  eventType: z.enum(['GOODS_RECEIVED', 'INSPECTION_PASSED', 'GOODS_OUTBOUND', 'DELIVERED']),
  shipmentId: z.string().regex(/^SHIP-\d{3,4}$/),
  timestamp: z.number().int().positive().optional(),
  source: z.literal('Shanghai Demo Warehouse').optional(),
  sku: z.literal('SKU-001').optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  // Dollars at the REST boundary; six-decimal integer amounts inside the protocol.
  declaredValue: z.union([z.number().positive().max(1_000_000_000), z.string().regex(/^\d{1,10}(\.\d{1,6})?$/)]).optional()
}).strict();

export type EventType = z.infer<typeof base>['eventType'];
export interface BaseSupplyChainEvent { eventId: string; shipmentId: string; timestamp: number; source: string; }
export interface GoodsReceivedEvent extends BaseSupplyChainEvent { eventType: 'GOODS_RECEIVED'; sku: string; quantity: number; declaredValue: bigint; }
export interface InspectionPassedEvent extends BaseSupplyChainEvent { eventType: 'INSPECTION_PASSED'; }
export interface GoodsOutboundEvent extends BaseSupplyChainEvent { eventType: 'GOODS_OUTBOUND'; }
export interface DeliveredEvent extends BaseSupplyChainEvent { eventType: 'DELIVERED'; }
export type SupplyChainEvent = GoodsReceivedEvent | InspectionPassedEvent | GoodsOutboundEvent | DeliveredEvent;

export function normalizeEvent(input: unknown): SupplyChainEvent {
  const e = base.parse(input);
  const timestamp = e.timestamp ?? Math.floor(Date.now() / 1000);
  if (Math.abs(timestamp - Date.now() / 1000) > 86400) throw new Error('Event timestamp must be within 24 hours');
  const common = { eventId: e.eventId ?? randomUUID(), shipmentId: e.shipmentId, timestamp, source: 'Shanghai Demo Warehouse' };
  if (e.eventType === 'GOODS_RECEIVED') {
    if (!e.quantity || e.declaredValue === undefined) throw new Error('GOODS_RECEIVED requires quantity and declaredValue');
    const value = String(e.declaredValue);
    if (!/^\d{1,10}(\.\d{1,6})?$/.test(value)) throw new Error('declaredValue requires at most six decimals');
    const declaredValue = parseUnits(value, 6);
    if (declaredValue <= 0n || declaredValue > parseUnits('1000000000', 6)) throw new Error('Invalid declaredValue');
    return { ...common, eventType: e.eventType, sku: e.sku ?? 'SKU-001', quantity: e.quantity, declaredValue };
  }
  return { ...common, eventType: e.eventType };
}
