import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import solc from 'solc';
import {createPublicClient,createWalletClient,defineChain,http,parseEther,parseUnits,formatEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {root,directory,accounts,publicConfig,secureWrite,roles} from './demo-profile.mjs';
export function fundingPlan(price,balances={}){
 const units={source:600000n,supplier:600000n,buyer:1000000n,lender:600000n};
 const targets=Object.fromEntries(Object.entries(units).map(([r,u])=>[r,price*u>parseEther('0.05')?price*u:parseEther('0.05')]));
 const topups=Object.fromEntries(Object.entries(targets).map(([r,n])=>[r,n>BigInt(balances[r]??0)?n-BigInt(balances[r]??0):0n]));
 return {targets,topups,required:price*3500000n+Object.values(topups).reduce((a,b)=>a+b,0n)+parseEther('0.03')};
}
export function compileDemo(){const input={language:'Solidity',sources:Object.fromEntries(['MockUSDC','TradeRailPayables'].map(n=>[n+'.sol',{content:readFileSync(join(root,'contracts',n+'.sol'),'utf8')}])),settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));if(output.errors?.some(e=>e.severity==='error'))throw Error('Demo Solidity compilation failed');
 return Object.fromEntries(['MockUSDC','TradeRailPayables'].map(n=>[n,{abi:output.contracts[n+'.sol'][n].abi,bytecode:'0x'+output.contracts[n+'.sol'][n].evm.bytecode.object}]));}
export async function prepareDemo(profile,{prepareOnly=false,waitForFunds=false,rpcOverride}={}){
 const dir=directory(profile);const config=accounts(profile);const old=publicConfig(profile);
 const rpc=rpcOverride||process.env.TRADERAIL_SETUP_RPC||old?.rpcUrl||(profile==='sandbox'?'http://127.0.0.1:8546':'https://rpc-testnet.monadinfra.com');
 const local=profile==='sandbox';if(local&&!['localhost','127.0.0.1'].includes(new URL(rpc).hostname))throw Error('Sandbox RPC must stay local');
 const chain=defineChain({id:local?31337:10143,name:local?'Local EVM · Anvil':'Monad Testnet',nativeCurrency:{name:local?'ETH':'MON',symbol:local?'ETH':'MON',decimals:18},rpcUrls:{default:{http:[rpc]}},testnet:true});
 const transport=http(rpc,{timeout:20000,retryCount:1});const client=createPublicClient({chain,transport});if(await client.getChainId()!==chain.id)throw Error('Unexpected chain; initialization stopped');
 if(old){if(old.chainId!==chain.id||old.source.toLowerCase()!==config.addresses.source.toLowerCase()||old.lender.toLowerCase()!==config.addresses.lender.toLowerCase())throw Error('Existing profile does not match its accounts');const code=await client.getCode({address:old.protocol});const anchor=await client.getBlock({blockNumber:BigInt(old.deploymentBlock)}).catch(()=>null);if(code&&code!=='0x'&&anchor?.hash===old.deploymentBlockHash){console.log('Existing '+profile+' deployment ready: '+old.protocol);return old;}throw Error('Saved chain state does not match this profile. Restore its state or reset this sandbox with --fresh.');}
 const signer=role=>createWalletClient({account:privateKeyToAccount(config.keys[role]),chain,transport});
 const balances=Object.fromEntries(await Promise.all(roles.slice(1).map(async r=>[r,await client.getBalance({address:config.addresses[r]})])));
 const plan=fundingPlan(await client.getGasPrice(),balances);let available=await client.getBalance({address:config.addresses.relayer});
 console.log('Profile: '+profile);console.log('Deployment funding address: '+config.addresses.relayer);
 console.log('Deployment wallet balance: '+formatEther(available)+' '+chain.nativeCurrency.symbol);
 console.log('Conservative initialization target (includes role balances): '+formatEther(plan.required)+' '+chain.nativeCurrency.symbol);
 if(prepareOnly)return {prepared:true,fundingAddress:config.addresses.relayer,required:String(plan.required)};
 if(!local&&available<plan.required){console.log('Fund this address with testnet MON, then run this command again. Faucet: https://faucet.monad.xyz');if(!waitForFunds){const e=new Error('Waiting for testnet funding; keys are saved locally. Use --wait to continue automatically after funding.');e.code='FUNDING_REQUIRED';throw e;}console.log('Waiting for funding. Ctrl+C safely stops; rerun reuses the same accounts.');while(available<plan.required){await new Promise(r=>setTimeout(r,5000));available=await client.getBalance({address:config.addresses.relayer});}}
 const journalPath=join(dir,'preparation.json');let journal={steps:{}};try{journal=JSON.parse(readFileSync(journalPath,'utf8'));}catch{}
 async function once(label,send){let hash=journal.steps[label];if(!hash){hash=await send();journal.steps[label]=hash;secureWrite(journalPath,journal);}const receipt=await client.waitForTransactionReceipt({hash,timeout:120000,confirmations:local?1:2});if(receipt.status!=='success')throw Error('Preparation reverted: '+label);console.log('Confirmed: '+label);return receipt;}
 if(!local)for(const role of roles.slice(1)){if(plan.topups[role]>0n)await once('fund-'+role,()=>signer('relayer').sendTransaction({to:config.addresses[role],value:plan.topups[role]}));}
 const artifacts=compileDemo();
 const tokenReceipt=await once('deploy-token',()=>signer('relayer').deployContract(artifacts.MockUSDC));const usdc=tokenReceipt.contractAddress;
 const receipt=await once('deploy-protocol',()=>signer('relayer').deployContract({...artifacts.TradeRailPayables,args:[usdc,config.addresses.source,config.addresses.lender,true]}));const protocol=receipt.contractAddress;
 for(const role of ['buyer','lender']){const value=parseUnits('10000000',6);await once('mint-'+role,()=>signer('relayer').writeContract({address:usdc,abi:artifacts.MockUSDC.abi,functionName:'mint',args:[config.addresses[role],value]}));await once('approve-'+role,()=>signer(role).writeContract({address:usdc,abi:artifacts.MockUSDC.abi,functionName:'approve',args:[protocol,value]}));}
 const anchor=await client.getBlock({blockNumber:receipt.blockNumber});
 const meta={enabled:true,protocolVersion:4,demoOnly:true,network:local?'local':'monadTestnet',chainId:chain.id,protocol,usdc,...config.addresses,deploymentBlock:String(receipt.blockNumber),deploymentBlockHash:anchor.hash,rpcUrl:rpc,preparations:Object.entries(journal.steps).map(([label,hash])=>({label,hash}))};secureWrite(join(dir,'deployment.json'),meta);
 console.log('Ready: '+chain.name+' / '+protocol);return meta;
}
