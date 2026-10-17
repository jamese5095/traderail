import {blocks} from '@backend/settlement-v4/service';
export const dynamic='force-dynamic';export async function GET(){try{return Response.json(await blocks(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'区块连接暂时中断 / RPC unavailable'},{status:503});}}
