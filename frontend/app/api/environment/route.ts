import {publicPayEnvironment} from '@backend/config/payables';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(publicPayEnvironment(),{headers:{'Cache-Control':'no-store'}});}
