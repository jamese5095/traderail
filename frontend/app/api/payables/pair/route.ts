import {pairing} from '@backend/settlement-v4/service';import {errorResponse} from '@backend/http';
export const runtime='nodejs';export async function POST(r:Request){try{return Response.json(await pairing(r),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
