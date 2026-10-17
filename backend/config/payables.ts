import 'server-only';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {defineChain,type Hex} from 'viem';
import deployed from '../../frontend/lib/payables-deployment.json';

export type DemoProfile='showcase'|'sandbox'|'testnet';
const requested=process.env.TRADERAIL_PROFILE??'showcase';
if(!['showcase','sandbox','testnet'].includes(requested))throw new Error('Unsupported TradeRail profile');
export const payProfile=requested as DemoProfile;
export const profileDir=process.env.TRADERAIL_PROFILE_DIR??resolve(process.cwd(),'..','.traderail',payProfile);
export const payMeta:typeof deployed=payProfile==='showcase'?deployed:JSON.parse(readFileSync(join(profileDir,'deployment.json'),'utf8'));
const local=payProfile==='sandbox';
if(payMeta.chainId!==(local?31337:10143)||!payMeta.demoOnly)throw new Error('Profile/network mismatch');
if(local&&!['127.0.0.1','localhost','[::1]'].includes(new URL(payMeta.rpcUrl).hostname))throw new Error('Sandbox RPC must stay local');
export const payRpc=payProfile==='showcase'?(process.env.TRADERAIL_RPC_URL||payMeta.rpcUrl):payMeta.rpcUrl;
export const payChain=defineChain({id:payMeta.chainId,name:local?'Local EVM · Anvil':'Monad Testnet',nativeCurrency:{name:local?'ETH':'MON',symbol:local?'ETH':'MON',decimals:18},rpcUrls:{default:{http:[payRpc]}},testnet:true});
export const paySessionDir=payProfile==='showcase'?(process.env.DEMO_SESSION_DIR??resolve(process.cwd(),'.demo-sessions')):join(profileDir,'sessions');
export const payPort=Number(process.env.PORT??(payProfile==='sandbox'?3002:payProfile==='testnet'?3004:3003));
export const payOrigin=`http://localhost:${payPort}`;
export function payKey(role:'buyer'|'supplier'|'lender'|'source'):Hex {
 if(payProfile==='showcase')return process.env[{buyer:'BUYER_PRIVATE_KEY',supplier:'SUPPLIER_PRIVATE_KEY',lender:'LENDER_PRIVATE_KEY',source:'WAREHOUSE_PRIVATE_KEY'}[role]] as Hex;
 const config=JSON.parse(readFileSync(join(profileDir,'accounts.json'),'utf8')) as {keys:Record<string,Hex>};
 return config.keys[role];
}
export function publicPayEnvironment(){return {profile:payProfile,protocol:payMeta.protocol,usdc:payMeta.usdc,buyer:payMeta.buyer,supplier:payMeta.supplier,lender:payMeta.lender,chainId:payMeta.chainId,network:payMeta.network,networkName:payChain.name,currency:payChain.nativeCurrency.symbol,explorerUrl:local?'':'https://testnet.monadscan.com'};}
