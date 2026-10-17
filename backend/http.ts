import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { BaseError } from 'viem';
import { ZodError } from 'zod';
import { isLocal } from './config/chain';

export class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }

export function authorizeWarehouse(request: Request) {
  if (isLocal && process.env.DEMO_SIGNER_ENABLED === 'true') { requireLocalOrigin(request); return; }
  const expected = process.env.WAREHOUSE_API_TOKEN;
  if (!expected) throw new ApiError('Warehouse API is not configured', 503);
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new ApiError('Warehouse authorization required', 401);
}

export function requireLocalOrigin(request: Request) {
  if (request.headers.get('x-traderail-remote')) throw new ApiError('Supplier gateway cannot access desktop signing', 403);
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new ApiError('Local demo signer requires localhost', 403);
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== url.host) throw new ApiError('Cross-origin mutations are not allowed', 403);
}

export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError('Use application/json', 415);
  const body = await request.text();
  if (body.length > 8192) throw new ApiError('Event body too large', 413);
  try { return JSON.parse(body); } catch { throw new ApiError('Invalid JSON'); }
}
export const serialize = (value: unknown) => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  if (error instanceof BaseError) return Response.json({ error: error.shortMessage }, { status: 409 });
  return Response.json({ error: error instanceof Error ? error.message : 'Settlement failed' }, { status: 400 });
}
