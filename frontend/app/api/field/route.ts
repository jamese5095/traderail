import {action,snapshot} from '@backend/settlement-v4/service';import {readJson,errorResponse} from '@backend/http';import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({action:z.literal('step'),order:z.string().regex(/^PAY-\d{4,}$/),step:z.enum(['deliver','purchase']),barcode:z.string().max(40).optional()}).strict();
export async function GET(r:Request){try{return Response.json(await snapshot(r,true),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(r:Request){try{return Response.json(await action(r,schema.parse(await readJson(r)),true));}catch(e){return errorResponse(e);}}
