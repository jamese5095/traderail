import { z } from 'zod';
import { railAction,railSnapshot } from '@backend/settlement-v3/service';
import { errorResponse,readJson } from '@backend/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
const input=z.object({action:z.enum(['create','step']),mode:z.enum(['direct','financed']).optional(),createId:z.string().uuid().optional(),order:z.string().regex(/^TRD-\d{4}$/).optional(),step:z.enum(['register','ship','accept','fund','advance','pay','sync']).optional(),barcode:z.string().max(80).optional()}).strict();
export async function GET(request:Request){try{return Response.json(await railSnapshot(request));}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{return Response.json(await railAction(request,input.parse(await readJson(request))));}catch(e){return errorResponse(e);}}
