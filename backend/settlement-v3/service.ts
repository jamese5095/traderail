import {createChainOrderId} from '../lib/order-identity';
import 'server-only';
import { mkdir,readFile,writeFile,rename,rm,stat } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPublicClient,createWalletClient,http,encodeFunctionData,decodeEventLog,keccak256,stringToHex,hashTypedData,zeroAddress,type Address,type Hex,type Abi } from 'viem';
import { privateKeyToAccount,mnemonicToAccount } from 'viem/accounts';
import { toHex } from 'viem';
import { railDeployment as meta,railChain,railLocal } from '../config/traderail';
import { ApiError,requireLocalOrigin,serialize } from '../http';
import abi from '../../frontend/lib/traderail-abi.json';
import tokenAbi from '../../frontend/lib/usdc-abi.json';
import { termTypes,eventTypes,railDomain } from '../../scripts/v3-schema.mjs';
import { deployerKey,warehouseKey,supplierKey,buyerKey } from '../../scripts/local-accounts.mjs';
import type { RailMode,RailStep,RailRecord,RailOperation,RailSnapshot,RailOrderView } from '../../frontend/lib/rail-types';

type Terms={id:Hex;mode:number;buyer:Address;supplier:Address;lender:Address;amount:bigint;principal:bigint;interest:bigint;notBefore:bigint;expiresAt:bigint};
type ChainOrder={terms:Terms;termsHash:Hex;escrow:bigint;drawn:boolean;paid:boolean;canceled:boolean;principalReturned:bigint;interestPaid:bigint;supplierProceeds:bigint};
type Stored={id:string;mode:RailMode;createId:string;createdAt:string;terms:Record<string,string|number>;signatures:Hex[];records:RailRecord[];operations:Record<string,RailOperation>;syncedAt?:string;signedTransactions?:Record<string,Hex>;};
type Session={orders:Stored[]};
const U=1_000_000n;
const client=createPublicClient({chain:railChain,transport:http(process.env.TRADERAIL_RPC_URL?.trim()||meta.rpcUrl,{timeout:20_000,retryCount:1})});
const dir=join(process.env.DEMO_SESSION_DIR??resolve(process.cwd(),'.demo-sessions'),`traderail-v3-${meta.chainId}-${meta.protocol}-${meta.deploymentBlockHash}`);
const file=join(dir,'session.json');const lock=join(dir,'lock');
const hash=(s:string)=>keccak256(stringToHex(s));const domain=railDomain(meta.chainId,meta.protocol);
const json=(x:unknown)=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v);
async function load():Promise<Session>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {orders:[]};throw e;}}
async function save(s:Session){await mkdir(dir,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,json(s),{mode:0o600});await rename(tmp,file);}
async function locked<T>(fn:()=>Promise<T>){
 await mkdir(dir,{recursive:true});const began=Date.now();
 while(true){try{await mkdir(lock);break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
  let lockTime:number;try{lockTime=(await stat(lock)).mtimeMs;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
  if(Date.now()-lockTime>120_000){await rm(lock,{recursive:true,force:true});continue;}
  if(Date.now()-began>45_000)throw new ApiError('TradeRail is processing the original request. Please retry the read.',409);
  await new Promise(r=>setTimeout(r,80));
 }}
 try{return await fn();}finally{await rm(lock,{recursive:true,force:true});}
}
function role(name:'buyer'|'supplier'|'lender'|'source'|'relayer'){
 const local={buyer:buyerKey,supplier:supplierKey,source:warehouseKey,relayer:deployerKey,lender:toHex(mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:4}).getHdKey().privateKey!)};
 const variables={buyer:'BUYER_PRIVATE_KEY',supplier:'SUPPLIER_PRIVATE_KEY',lender:'LENDER_PRIVATE_KEY',source:'WAREHOUSE_PRIVATE_KEY',relayer:'DEPLOYER_PRIVATE_KEY'};
 let account;try{account=privateKeyToAccount((railLocal?local[name]:process.env[variables[name]]) as Hex);}catch{throw new ApiError(`TradeRail ${name} test signer is not configured`,503);}
 if(account.address.toLowerCase()!==meta[name].toLowerCase())throw new ApiError(`TradeRail ${name} signer does not match deployment`,503);return account;
}
export function railAuthorize(request:Request){if(!meta.enabled||!meta.demoOnly||meta.protocolVersion!==3||![31337,10143].includes(meta.chainId)||process.env.GUIDED_DEMO_ENABLED!=='true')throw new ApiError('TradeRail test signing is disabled',403);requireLocalOrigin(request);for(const r of ['buyer','supplier','lender','source','relayer'] as const)role(r);}
let identityChecked=0;
async function identity(){if(Date.now()-identityChecked<30_000)return;const [chain,anchor,code]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:BigInt(meta.deploymentBlock)}),client.getCode({address:meta.protocol as Address})]);if(chain!==meta.chainId||anchor.hash!==meta.deploymentBlockHash||!code||code==='0x')throw new ApiError('TradeRail deployment identity mismatch',409);identityChecked=Date.now();}
const revive=(t:Stored['terms']):Terms=>({...t,amount:BigInt(t.amount),principal:BigInt(t.principal),interest:BigInt(t.interest),notBefore:BigInt(t.notBefore),expiresAt:BigInt(t.expiresAt)}) as Terms;
async function chainOrder(o:Stored){if(o.operations.register?.state!=='confirmed')return null;return await client.readContract({address:meta.protocol as Address,abi:abi as Abi,functionName:'getOrder',args:[o.terms.id as Hex]}) as unknown as ChainOrder;}
async function receipt(op:RailOperation){if(!op.hash||(op.state==='confirmed'&&op.evidenceVersion===1)||op.state==='failed')return;try{const r=await client.getTransactionReceipt({hash:op.hash as Hex});const final=await client.getBlock({blockTag:railLocal?'latest':'finalized'});if(final.number<r.blockNumber){op.state='confirming';return;}op.state=r.status==='success'?'confirmed':'failed';op.block=String(r.blockNumber);op.confirmedAt??=new Date().toISOString();op.gasUsed=String(r.gasUsed);op.transfers=[];for(const l of r.logs){if(l.address.toLowerCase()!==meta.usdc.toLowerCase())continue;try{const decoded=decodeEventLog({abi:tokenAbi as Abi,data:l.data,topics:l.topics});if(decoded.eventName==='Transfer'){const a=decoded.args as unknown as {from:string;to:string;value?:bigint;amount?:bigint};const amount=a.value??a.amount;if(amount===undefined)throw Error("Missing Transfer amount");op.transfers.push({from:a.from,to:a.to,amount:String(amount)});}}catch{}}
 op.evidenceVersion=1;
 if(op.state==='failed')op.error='Transaction reverted. Original receipt retained; no automatic resubmission.';
 }catch(e){op.state=(e as Error).name==='TransactionReceiptNotFoundError'?'confirming':'unknown';}}
const pending=(o:Stored)=>Object.values(o.operations).find(x=>x.hash&&x.state!=='confirmed'||x.state==='unknown');
function next(o:Stored,c:ChainOrder|null):RailStep {if(o.operations.register?.state!=='confirmed')return 'register';if(!o.records.some(r=>r.kind==='shipped'))return 'ship';if(!o.records.some(r=>r.kind==='accepted'))return 'accept';if(c?.paid)return o.syncedAt?'complete':'sync';if(o.mode==='financed'&&c?.escrow===0n&&!c.drawn)return 'fund';if(o.mode==='financed'&&!c?.drawn)return 'advance';return 'pay';}
async function attest(o:Stored,action:number){const kind=action===1?'advanceAuthorization':'paymentAuthorization';let r=o.records.find(r=>r.kind===kind);if(r)return r;
 if(!o.records.some(r=>r.kind==='accepted'))throw new ApiError('Buyer acceptance must be recorded before financial authorization',409);
 const t=revive(o.terms);
 // hashTerms is the EIP-712 struct hash, not the full domain digest.
 const structHash=await client.readContract({address:meta.protocol as Address,abi:abi as Abi,functionName:'hashTerms',args:[t]}) as Hex;
 const commitment=hash(json(o.records.filter(r=>['shipped','accepted'].includes(r.kind)).map(r=>({id:r.id,commitment:r.commitment}))));
 const e={orderId:o.terms.id as Hex,eventId:hash(`${o.terms.id}:${kind}`),termsHash:structHash,recordCommitment:commitment,action,nonce:BigInt(action),expiresAt:BigInt(Math.floor(Date.now()/1000)+86_400)};
 const signature=await role('source').signTypedData({domain,types:eventTypes,primaryType:'BusinessEvent',message:e});
 r={id:e.eventId,kind,at:new Date().toISOString(),commitment,signature,event:serialize(e),verified:true};o.records.push(r);return r;
}
async function submit(s:Session,o:Stored,step:RailStep){let op=o.operations[step];if(op?.hash||op?.state==='unknown')return op;if(step==='complete'||step==='ship'||step==='accept'||step==='sync')throw new ApiError('Not a financial transaction');
 const account=role(step==='fund'?'lender':'relayer');const wallet=createWalletClient({account,chain:railChain,transport:http(process.env.TRADERAIL_RPC_URL?.trim()||meta.rpcUrl,{timeout:20_000,retryCount:0})});
 let name:string;let args:unknown[];
 if(step==='register'){name='registerOrder';args=[revive(o.terms),...o.signatures];}
 else if(step==='fund'){name='fundAdvance';args=[o.terms.id as Hex];}
 else{const r=await attest(o,step==='advance'?1:2);const e={...r.event,nonce:BigInt(r.event!.nonce),expiresAt:BigInt(r.event!.expiresAt)};name=step==='advance'?'drawAdvance':'settlePayment';args=[e,r.signature];}
 await save(s);
 try{await client.simulateContract({account,address:meta.protocol as Address,abi:abi as Abi,functionName:name,args});}catch{op={step,state:'preflightFailed',error:'Preflight rejected; no funds moved. Check balance, allowance and authorization.'};o.operations[step]=op;await save(s);throw new ApiError(op.error!,409);}
 const data=encodeFunctionData({abi:abi as Abi,functionName:name,args});
 const gasBalance=await client.getBalance({address:account.address});
 if(gasBalance===0n){op={step,state:'preflightFailed',error:'Test gas is insufficient. Top up the signing role, then retry; no transaction was broadcast.'};o.operations[step]=op;await save(s);throw new ApiError(op.error!,409);}
 const tx=await wallet.prepareTransactionRequest({account,to:meta.protocol as Address,data}).catch(async()=>{op={step,state:'preflightFailed',error:'Transaction preparation failed before broadcast. Check test gas, fees and RPC.'};o.operations[step]=op;await save(s);throw new ApiError(op.error!,409);});
 const maxCost=(tx.gas??0n)*(tx.maxFeePerGas??tx.gasPrice??0n)+(tx.value??0n);
 if(gasBalance<maxCost){op={step,state:'preflightFailed',error:'Test gas is insufficient. Top up the signing role, then retry; no transaction was broadcast.'};o.operations[step]=op;await save(s);throw new ApiError(op.error!,409);}
 const raw=await wallet.signTransaction(tx);const txHash=keccak256(raw);o.signedTransactions??={};o.signedTransactions[step]=raw;
 // Predict and persist the exact signed hash before broadcast: a lost HTTP response never loses identity.
 op={step,state:'submitted',hash:txHash,submittedAt:new Date().toISOString()};o.operations[step]=op;await save(s);
 try{if(process.env.TRADERAIL_SIMULATE_BROADCAST_LOSS===step)throw Error('Simulated broadcast loss');await client.sendRawTransaction({serializedTransaction:raw});await receipt(op);}catch{op.state='unknown';op.error='Checking the original signed transaction. No second payout will be sent.';}await save(s);return op;
}
async function view(s:Session,o:Stored):Promise<RailOrderView>{for(const op of Object.values(o.operations))await receipt(op);const c=await chainOrder(o);return {id:o.id,mode:o.mode,createdAt:o.createdAt,records:o.records,operations:o.operations,syncedAt:o.syncedAt,next:next(o,c),pending:pending(o),termsHash:c?.termsHash,escrow:String(c?.escrow??0),advance:String(c?.drawn?c.terms.principal:0),principalReturned:String(c?.principalReturned??0),interestPaid:String(c?.interestPaid??0),proceeds:String(c?.supplierProceeds??0),paid:c?.paid??false,debt:String(c?.drawn&&!c.paid?c.terms.principal+c.terms.interest:0)};}
export async function railSnapshot(request:Request):Promise<RailSnapshot>{return locked(async()=>{if(!meta.enabled)throw new ApiError('TradeRail V3 is not deployed',503);await identity();const s=await load();const requested=new URL(request.url).searchParams.get('order');const active=s.orders.at(-1);const o=requested?s.orders.find(o=>o.id===requested):active;if(requested&&!o)throw new ApiError('Order not found',404);const v=o?await view(s,o):null;if(o)await save(s);
 const [bb,lb,ba,la]=await Promise.all([client.readContract({address:meta.usdc as Address,abi:tokenAbi as Abi,functionName:'balanceOf',args:[meta.buyer]}),client.readContract({address:meta.usdc as Address,abi:tokenAbi as Abi,functionName:'balanceOf',args:[meta.lender]}),client.readContract({address:meta.usdc as Address,abi:tokenAbi as Abi,functionName:'allowance',args:[meta.buyer,meta.protocol]}),client.readContract({address:meta.usdc as Address,abi:tokenAbi as Abi,functionName:'allowance',args:[meta.lender,meta.protocol]})]);
 let enabled=true;try{railAuthorize(request);}catch{enabled=false;}
 return {order:v,active:active?.id??null,archived:!!o&&o!==active,enabled,history:s.orders.map(o=>({id:o.id,mode:o.mode,paid:o.operations.pay?.state==='confirmed'})),deployment:{protocol:meta.protocol,usdc:meta.usdc,buyer:meta.buyer,supplier:meta.supplier,lender:meta.lender,source:meta.source,relayer:meta.relayer,network:meta.network,chainId:meta.chainId,preparations:meta.preparations},readiness:{buyerBalance:String(bb),lenderBalance:String(lb),buyerAllowance:String(ba),lenderAllowance:String(la)}};
 });}
export async function railAction(request:Request,body:{action:string;mode?:RailMode;createId?:string;order?:string;step?:RailStep;barcode?:string}){railAuthorize(request);return locked(async()=>{await identity();const s=await load();for(const o of s.orders)for(const op of Object.values(o.operations))await receipt(op);
 if(body.action==='create'){
  const existing=s.orders.find(o=>o.createId===body.createId);if(existing){if(existing.mode!==body.mode)throw new ApiError('Creation ID conflicts with mode',409);await save(s);return {order:existing.id,operation:existing.operations.register};}
  if(!body.createId||!body.mode)throw new ApiError('Choose the order mode');
  const active=s.orders.at(-1);if(active){const c=await chainOrder(active);if(next(active,c)!=='complete')throw new ApiError('Finish or recover the active order before starting another',409);}
  if(s.orders.length>=20)throw new ApiError('Prepared test balances support twenty rounds; replenish explicitly before more orders',409);
  const [balance,allowance]=await Promise.all([client.readContract({address:meta.usdc as Address,abi:tokenAbi as Abi,functionName:'balanceOf',args:[meta.buyer]}),client.readContract({address:meta.usdc as Address,abi:tokenAbi as Abi,functionName:'allowance',args:[meta.buyer,meta.protocol]})]) as bigint[];if(balance<100_000n*U||allowance<100_000n*U)throw new ApiError('Buyer needs prepared balance and authorization',409);
  const id=`TRD-${String(s.orders.length+1).padStart(4,'0')}`;const financed=body.mode==='financed';const t:Terms={id:createChainOrderId(),mode:financed?1:0,buyer:meta.buyer as Address,supplier:meta.supplier as Address,lender:financed?meta.lender as Address:zeroAddress,amount:100_000n*U,principal:financed?50_000n*U:0n,interest:financed?1_000n*U:0n,notBefore:0n,expiresAt:BigInt(Math.floor(Date.now()/1000)+30*86_400)};
  const signatures=await Promise.all([role('buyer').signTypedData({domain,types:termTypes,primaryType:'Terms',message:t}),role('supplier').signTypedData({domain,types:termTypes,primaryType:'Terms',message:t}),financed?role('lender').signTypedData({domain,types:termTypes,primaryType:'Terms',message:t}):Promise.resolve('0x' as Hex)]);
  const o:Stored={id,mode:body.mode,createId:body.createId,createdAt:new Date().toISOString(),terms:serialize(t),signatures,records:[],operations:{}};s.orders.push(o);await save(s);const operation=await submit(s,o,'register');return {order:id,operation};
 }
 const o=s.orders.find(o=>o.id===body.order);if(!o||o!==s.orders.at(-1))throw new ApiError('Only the active order may change',409);
 const step=body.step;if(!step)throw new ApiError('Missing step');
 if(step==='ship'||step==='accept'){if(body.barcode&&body.barcode!==`${o.id}:${step.toUpperCase()}`)throw new ApiError('Barcode does not match the current order and stage',409);const kind=step==='ship'?'shipped':'accepted';if(o.records.some(r=>r.kind===kind)){await save(s);return {order:o.id,businessEvent:kind,reused:true};}}
 if(step==='sync'&&o.syncedAt){await save(s);return {order:o.id,syncedAt:o.syncedAt,reused:true};}
 const previous=o.operations[step];if(previous?.hash){
 if(previous.state!=='confirmed'&&previous.state!=='failed'&&o.signedTransactions?.[step]){
  const raw=o.signedTransactions[step];if(keccak256(raw)!==previous.hash)throw new ApiError('Original signed transaction identity mismatch',409);
  let absent=false;try{await client.getTransaction({hash:previous.hash as Hex});}catch(e){absent=(e as Error).name==='TransactionNotFoundError';}
  if(absent){try{await client.sendRawTransaction({serializedTransaction:raw});previous.state='submitted';delete previous.error;}catch{previous.state='unknown';previous.error='Original submission is still unavailable. Check test gas and RPC; the same hash is retained.';}}
  await receipt(previous);
 }await save(s);return {order:o.id,operation:previous};}
 if(pending(o))throw new ApiError('Recover the original transaction before another action',409);
 const c=await chainOrder(o);if(next(o,c)!==step)throw new ApiError('Order stage changed. Refresh before acting.',409);
 if(body.barcode&&body.barcode!==`${o.id}:${step.toUpperCase()}`)throw new ApiError('Barcode does not match the current order and stage',409);
 if(step==='ship'||step==='accept'){const kind=step==='ship'?'shipped':'accepted';const at=new Date().toISOString();o.records.push({id:`${o.id}:${kind}`,kind,at,commitment:hash(json({order:o.id,kind,at,source:'Mock ERP'}))});await save(s);return {order:o.id,businessEvent:kind};}
 if(step==='sync'){if(!c?.paid||o.operations.pay?.state!=='confirmed')throw new ApiError('Confirmed payment is required before ledger sync',409);if(process.env.TRADERAIL_SIMULATE_SYNC_FAILURE==='true')throw new ApiError('ERP writeback unavailable. Funds are already settled; retry sync only.',503);o.syncedAt=new Date().toISOString();o.records.push({id:`${o.id}:receipt`,kind:'receiptSynced',at:o.syncedAt,commitment:hash(o.operations.pay.hash!)});await save(s);return {order:o.id,syncedAt:o.syncedAt};}
 const operation=await submit(s,o,step);return {order:o.id,operation};
 });}
