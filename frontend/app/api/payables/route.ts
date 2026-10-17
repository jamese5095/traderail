import {action,snapshot} from '@backend/settlement-v4/service';
import {readJson,errorResponse} from '@backend/http';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({action:z.enum(['create','mode','step']),mode:z.enum(['direct','factoring']).optional(),createId:z.string().uuid().optional(),terms:z.object({face:z.string().max(24),principal:z.string().max(24),interest:z.string().max(24)}).strict().optional(),order:z.string().regex(/^PAY-\d{4,}$/).optional(),step:z.enum(['deliver','approve','quote','purchase','mature','settle']).optional()}).strict();
export async function GET(r:Request){try{return Response.json(await snapshot(r),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(r:Request){try{return Response.json(await action(r,schema.parse(await readJson(r))));}catch(e){return errorResponse(e);}}
