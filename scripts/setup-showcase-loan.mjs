// Rotate only the three business roles for the localhost:3000 Monad TESTNET showcase.
// All credentials and recovery journals stay in ignored .traderail/showcase-loan/.
import {readFileSync,writeFileSync,existsSync,copyFileSync,chmodSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {join} from 'node:path';
import {createPublicClient,createWalletClient,defineChain,http,parseEther,parseUnits,formatEther} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {root,secureWrite} from './lib/demo-profile.mjs';
import {compileDemo} from './lib/prepare-demo.mjs';

async function main(){
 const dir=join(root,'.traderail/showcase-loan');
 const envFiles=['.env','frontend/.env.local'].map(f=>join(root,f)).filter(existsSync);
 const env=Object.assign({},...envFiles.map(p=>parseEnv(readFileSync(p,'utf8'))));
 const previous=JSON.parse(readFileSync(join(root,'frontend/lib/payables-deployment.json'),'utf8'));
 const accountFile=join(dir,'accounts.json');let config;
 if(existsSync(accountFile))config=JSON.parse(readFileSync(accountFile,'utf8'));
 else{
  const keys={relayer:env.DEPLOYER_PRIVATE_KEY,source:env.WAREHOUSE_PRIVATE_KEY,buyer:generatePrivateKey(),supplier:generatePrivateKey(),lender:generatePrivateKey()};
  const addresses=Object.fromEntries(Object.entries(keys).map(([r,k])=>[r,privateKeyToAccount(k).address]));
  config={keys,addresses,previous};secureWrite(accountFile,config);
  for(const p of envFiles){const backup=join(dir,p.endsWith('.env.local')?'frontend-env-before-rotation':'root-env-before-rotation');copyFileSync(p,backup);chmodSync(backup,0o600);}
 }
 if(new Set(Object.values(config.addresses).map(a=>a.toLowerCase())).size!==5)throw Error('Role addresses must be distinct');
 for(const role of ['buyer','supplier','lender'])if(config.addresses[role].toLowerCase()===config.previous[role].toLowerCase())throw Error('Business role did not rotate');
 const rpc=env.TRADERAIL_RPC_URL||env.RPC_URL||config.previous.rpcUrl;
 const chain=defineChain({id:10143,name:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}},testnet:true});
 const transport=http(rpc,{timeout:20000,retryCount:1});const client=createPublicClient({chain,transport});
 if(await client.getChainId()!==10143)throw Error('Only Monad Testnet is supported');
 const signer=role=>createWalletClient({account:privateKeyToAccount(config.keys[role]),chain,transport});
 const artifacts=compileDemo();const usdc=config.previous.usdc;
 if(await client.readContract({address:usdc,abi:artifacts.MockUSDC.abi,functionName:'name'})!=='Demo USD Coin')throw Error('Expected the existing valueless MockUSDC');
 const balances=Object.fromEntries(await Promise.all(Object.keys(config.addresses).map(async role=>[role,await client.getBalance({address:config.addresses[role]})])));
 const gas=await client.getGasPrice();const estimate=gas*2200000n;const gasTarget=parseEther('0.15');
 console.log('Network: Monad Testnet / 10143');
 console.log('Role addresses:',JSON.stringify(config.addresses));
 console.log('Deployer MON:',formatEther(balances.relayer),' / conservative contract budget:',formatEther(estimate));
 console.log('Business-source MON:',formatEther(balances.source),' / new business role target: 0.15 MON each');
 if(process.argv.includes('--prepare-only'))return;
 const journalFile=join(dir,'preparation.json');let journal={steps:{}};if(existsSync(journalFile))journal=JSON.parse(readFileSync(journalFile,'utf8'));
 async function once(label,send){let hash=journal.steps[label];if(!hash){hash=await send();journal.steps[label]=hash;secureWrite(journalFile,journal);}const receipt=await client.waitForTransactionReceipt({hash,timeout:120000,confirmations:2});if(receipt.status!=='success')throw Error('Transaction reverted: '+label);console.log('Confirmed:',label,hash);return receipt;}
 const shortfall=['buyer','supplier','lender'].reduce((sum,r)=>sum+(gasTarget>balances[r]?gasTarget-balances[r]:0n),0n);
 if(!journal.steps['deploy-protocol']&&balances.relayer<estimate)throw Error('Deployment account needs more testnet MON; no configuration was activated');
 if(balances.source<shortfall+gas*100000n)throw Error('Business-source account needs more testnet MON for role funding; no configuration was activated');
 for(const role of ['buyer','supplier','lender'])if(balances[role]<gasTarget)await once('fund-'+role,()=>signer('source').sendTransaction({to:config.addresses[role],value:gasTarget-balances[role]}));
 const receipt=await once('deploy-protocol',()=>signer('relayer').deployContract({...artifacts.TradeRailPayables,args:[usdc,config.addresses.source,config.addresses.lender,true]}));
 const protocol=receipt.contractAddress;
 if(await client.readContract({address:protocol,abi:artifacts.TradeRailPayables.abi,functionName:'protocolVersion'})!==5n)throw Error('Wrong protocol version');
 for(const role of ['buyer','lender']){
  const amount=parseUnits('10000000',6);
  await once('mint-'+role,()=>signer('relayer').writeContract({address:usdc,abi:artifacts.MockUSDC.abi,functionName:'mint',args:[config.addresses[role],amount]}));
  await once('approve-'+role,()=>signer(role).writeContract({address:usdc,abi:artifacts.MockUSDC.abi,functionName:'approve',args:[protocol,amount]}));
 }
 const anchor=await client.getBlock({blockNumber:receipt.blockNumber});
 const meta={enabled:true,protocolVersion:5,financingModel:'partial-loan',demoOnly:true,network:'monadTestnet',chainId:10143,protocol,usdc,...config.addresses,deploymentBlock:String(receipt.blockNumber),deploymentBlockHash:anchor.hash,rpcUrl:'https://rpc-testnet.monadinfra.com',preparations:Object.entries(journal.steps).map(([label,hash])=>({label,hash}))};
 secureWrite(join(dir,'deployment.json'),meta);
 // Activate only after deployments, balances and approvals are confirmed. Existing order namespaces remain intact.
 secureWrite(join(root,'deployments/archive/showcase-before-partial-loan.json'),config.previous);
 const vars={buyer:['BUYER_PRIVATE_KEY','BUYER_ADDRESS'],supplier:['SUPPLIER_PRIVATE_KEY','SUPPLIER_ADDRESS'],lender:['LENDER_PRIVATE_KEY','LENDER_ADDRESS']};
 for(const p of envFiles){let text=readFileSync(p,'utf8');for(const [role,[keyName,addressName]]of Object.entries(vars))for(const [name,value]of [[keyName,config.keys[role]],[addressName,config.addresses[role]]]){const line=name+'='+value;const pattern=new RegExp('^'+name+'=.*$','m');text=pattern.test(text)?text.replace(pattern,()=>line):text.trimEnd()+'\n'+line+'\n';}writeFileSync(p,text,{mode:0o600});chmodSync(p,0o600);}
 writeFileSync(join(root,'frontend/lib/payables-deployment.json'),JSON.stringify(meta,null,2)+'\n');
 writeFileSync(join(root,'deployments/traderail-v4-monadTestnet.json'),JSON.stringify(meta,null,2)+'\n');
 writeFileSync(join(root,'frontend/lib/payables-abi.json'),JSON.stringify(artifacts.TradeRailPayables.abi,null,2)+'\n');
 const funds=[];for(const role of ['buyer','supplier','lender'])funds.push({role,address:config.addresses[role],mon:formatEther(await client.getBalance({address:config.addresses[role]})),mockUSDC:String(await client.readContract({address:usdc,abi:artifacts.MockUSDC.abi,functionName:'balanceOf',args:[config.addresses[role]]}))});
 console.log('New deployment activated:',protocol);console.log('Business role balances (MockUSDC uses 6 decimals):',JSON.stringify(funds));
}
main().catch(()=>{console.error('Showcase rotation stopped. Check testnet funding, RPC and private preparation journal; credentials were not printed. Rerun safely resumes confirmed transactions.');process.exitCode=1;});
