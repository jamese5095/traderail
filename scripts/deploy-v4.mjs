process.on('unhandledRejection',()=>{console.error('V4 deployment stopped. Check test gas, role configuration and RPC; credentials are not printed.');process.exitCode=1;});
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createPublicClient,createWalletClient,defineChain,http,parseEther,parseUnits,toHex } from 'viem';
import { privateKeyToAccount,mnemonicToAccount } from 'viem/accounts';
import { fileURLToPath } from 'node:url';
import { deployerKey,warehouseKey,supplierKey,buyerKey } from './local-accounts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const network=process.argv[2]??'local';if(!['local','monadTestnet'].includes(network))throw Error('Invalid network');
const local=network==='local';const id=local?31337:10143;const rpc=local?'http://127.0.0.1:8546':process.env.RPC_URL?.trim()||'https://rpc-testnet.monadinfra.com';
const lenderLocal=toHex(mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:4}).getHdKey().privateKey);
const keys={relayer:local?deployerKey:process.env.DEPLOYER_PRIVATE_KEY,source:local?warehouseKey:process.env.WAREHOUSE_PRIVATE_KEY,supplier:local?supplierKey:process.env.SUPPLIER_PRIVATE_KEY,buyer:local?buyerKey:process.env.BUYER_PRIVATE_KEY,lender:local?lenderLocal:process.env.LENDER_PRIVATE_KEY};
const accounts={};for(const [role,key]of Object.entries(keys)){try{accounts[role]=privateKeyToAccount(key);}catch{throw Error(`Configure the ${role} test role locally; credentials were not printed`);}}
const chain=defineChain({id,name:network,nativeCurrency:{name:local?'ETH':'MON',symbol:local?'ETH':'MON',decimals:18},rpcUrls:{default:{http:[rpc]}},testnet:true});
const client=createPublicClient({chain,transport:http(rpc,{timeout:30_000})});if(await client.getChainId()!==id)throw Error('Unexpected chain');
const wallet=role=>createWalletClient({account:accounts[role],chain,transport:http(rpc,{timeout:30_000})});
const wait=hash=>client.waitForTransactionReceipt({hash,timeout:120_000,confirmations:local?1:2}).then(r=>{if(r.status!=='success')throw Error('Preparation transaction reverted');return r;});
if(!local){for(const role of ['lender','buyer']){if(await client.getBalance({address:accounts[role].address})<parseEther('0.1')){const hash=await wallet('relayer').sendTransaction({to:accounts[role].address,value:parseEther('0.25')});await wait(hash);console.log(`Prepared ${role} test gas: ${hash}`);}}}
const build=spawnSync('forge',['build','--skip','test'],{cwd:root+'contracts',stdio:['ignore','pipe','pipe']});if(build.status!==0)throw Error('Contract build failed');
const artifact=name=>JSON.parse(readFileSync(root+`contracts/out/${name}.sol/${name}.json`));const token=artifact('MockUSDC');const protocol=artifact('TradeRailPayables');
const preparations=[];
const tokenHash=await wallet('relayer').deployContract({abi:token.abi,bytecode:token.bytecode.object});const tokenReceipt=await wait(tokenHash);const usdc=tokenReceipt.contractAddress;preparations.push({label:'Test-token deployment',hash:tokenHash});
const protocolHash=await wallet('relayer').deployContract({abi:protocol.abi,bytecode:protocol.bytecode.object,args:[usdc,accounts.source.address,accounts.lender.address,true]});const receipt=await wait(protocolHash);const address=receipt.contractAddress;preparations.push({label:'Settlement deployment',hash:protocolHash});
for(const [role,amount]of [['buyer',10_000_000],['lender',10_000_000]]){const value=parseUnits(String(amount),6);let hash=await wallet('relayer').writeContract({address:usdc,abi:token.abi,functionName:'mint',args:[accounts[role].address,value]});await wait(hash);preparations.push({label:`${role} mock balance`,hash});hash=await wallet(role).writeContract({address:usdc,abi:token.abi,functionName:'approve',args:[address,value]});await wait(hash);preparations.push({label:`${role} bounded token approval`,hash});}
const anchor=await client.getBlock({blockNumber:receipt.blockNumber});const meta={enabled:true,protocolVersion:5,financingModel:'partial-loan',demoOnly:true,network,chainId:id,protocol:address,usdc,...Object.fromEntries(Object.entries(accounts).map(([r,a])=>[r,a.address])),deploymentBlock:String(receipt.blockNumber),deploymentBlockHash:anchor.hash,rpcUrl:local?rpc:'https://rpc-testnet.monadinfra.com',preparations};
mkdirSync(root+'deployments/archive',{recursive:true});const path=root+`deployments/traderail-v4-${network}.json`;if(existsSync(path)){const old=JSON.parse(readFileSync(path));copyFileSync(path,root+`deployments/archive/traderail-v4-${network}-${old.protocol}.json`);}
writeFileSync(path,JSON.stringify(meta,null,2)+'\n');writeFileSync(root+'frontend/lib/payables-deployment.json',JSON.stringify(meta,null,2)+'\n');writeFileSync(root+'frontend/lib/payables-abi.json',JSON.stringify(protocol.abi,null,2)+'\n');console.log(JSON.stringify({network,protocol:address,usdc,roles:Object.fromEntries(Object.entries(accounts).map(([r,a])=>[r,a.address]))},null,2));
