import {readiness} from '@backend/settlement-v4/service';
import {errorResponse} from '@backend/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await readiness(request),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
