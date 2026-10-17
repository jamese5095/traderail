import { z } from 'zod';
import type { Hash } from 'viem';
import { transactionStatus, businessStatus } from '@backend/transactions';
import { errorResponse } from '@backend/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams;
    if (params.has('eventId')) return Response.json(await businessStatus(z.string().min(1).max(128).parse(params.get('eventId'))), { headers: { 'Cache-Control': 'no-store' } });
    const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(new URL(request.url).searchParams.get('hash')) as Hash;
    return Response.json(await transactionStatus(hash), { headers: { 'Cache-Control': 'no-store' } });
  } catch(e) { return errorResponse(e); }
}
