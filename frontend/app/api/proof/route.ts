import {createPublicClient,http,isAddress,isHash} from 'viem';
import {payChain,payRpc} from '@backend/config/payables';
import {errorResponse,ApiError} from '@backend/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const url=new URL(request.url);const kind=url.searchParams.get('kind');const id=url.searchParams.get('id')??'';
 const client=createPublicClient({chain:payChain,transport:http(payRpc,{timeout:12000,retryCount:0})});
 let result:unknown;
 if(kind==='tx'&&isHash(id))result={transaction:await client.getTransaction({hash:id}),receipt:await client.getTransactionReceipt({hash:id})};
 else if(kind==='block'&&/^\d+$/.test(id))result=await client.getBlock({blockNumber:BigInt(id)});
 else if(kind==='address'&&isAddress(id))result={address:id,nativeBalance:await client.getBalance({address:id}),bytecode:await client.getCode({address:id})??'0x'};
 else throw new ApiError('Invalid proof reference');
 return Response.json(JSON.parse(JSON.stringify({network:payChain.name,chainId:payChain.id,result},(_,v)=>typeof v==='bigint'?v.toString():v)),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
