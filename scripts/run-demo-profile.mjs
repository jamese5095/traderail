import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,rmSync,readFileSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import net from 'node:net';
import {root,directory,webPort} from './lib/demo-profile.mjs';
import {prepareDemo} from './lib/prepare-demo.mjs';
import {webFingerprint} from './lib/web-build.mjs';
const profile=process.argv[2];const fresh=process.argv.includes('--fresh');if(!['sandbox','testnet'].includes(profile)||fresh&&profile!=='sandbox'){console.error('Use sandbox [--fresh] or testnet');process.exit(1);}
const dir=directory(profile);const port=webPort(profile);const children=[];let closing=false;
const free=p=>new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(p,'127.0.0.1',()=>s.close(()=>resolve(true)));});
async function stop(){if(closing)return;closing=true;for(const c of children)c.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void stop();});
try{
 if(!await free(port))throw Error('Web port '+port+' is already in use; existing servers were not stopped');
 if(profile==='sandbox'){
  if(!await free(8546))throw Error('Sandbox RPC port 8546 is already in use; existing processes were not stopped');
  if(fresh){const accountPath=join(dir,'accounts.json');if(existsSync(accountPath)&&JSON.parse(readFileSync(accountPath,'utf8')).profile!=='sandbox')throw Error('Refusing to reset a non-sandbox profile');for(const name of ['accounts.json','deployment.json','preparation.json','chain-state.json','anvil.log','sessions'])rmSync(join(dir,name),{recursive:true,force:true});}mkdirSync(dir,{recursive:true,mode:0o700});
  const state=join(dir,'chain-state.json');const log=openSync(join(dir,'anvil.log'),'a',0o600);
  const args=['--host','127.0.0.1','--port','8546','--chain-id','31337','--hardfork','cancun','--block-time','1','--slots-in-an-epoch','1','--silent','--dump-state',state];if(existsSync(state))args.push('--load-state',state);
  const anvil=spawn('anvil',args,{stdio:['ignore',log,log]});closeSync(log);children.push(anvil);let failure;anvil.on('error',()=>{failure=true;});
  for(let i=0;i<60;i++){if(failure)throw Error('Anvil is missing. Install Foundry before starting the sandbox.');try{const r=await fetch('http://127.0.0.1:8546',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});if((await r.json()).result==='0x7a69')break;}catch{}if(i===59)throw Error('Sandbox node did not become ready');await new Promise(r=>setTimeout(r,250));}
 }
 await prepareDemo(profile);
 const buildDir='.next-'+profile;const buildEnv={...process.env,TRADERAIL_BUILD_DIR:buildDir,TRADERAIL_PROFILE:profile,TRADERAIL_PROFILE_DIR:dir,GUIDED_DEMO_ENABLED:'true'};
 let savedHash='';try{savedHash=readFileSync(join(root,'frontend',buildDir,'traderail-source-hash'),'utf8');}catch{}
 if(!existsSync(join(root,'frontend',buildDir,'standalone/frontend/server.js'))||savedHash!==webFingerprint()){console.log('First startup: building the web app.');await new Promise((ok,bad)=>{const c=spawn('npm',['run','build'],{cwd:root,stdio:'inherit',env:buildEnv});children.push(c);c.on('error',bad);c.on('exit',code=>code===0?ok():bad(Error('Web build failed')));});}
 console.log('Demo: http://localhost:'+port+' / profile: '+profile);
 console.log('Phone: npm run phone -- --profile '+profile);
 const child=spawn(process.execPath,[join(root,'scripts/start.mjs')],{cwd:root,stdio:'inherit',env:{...buildEnv,PORT:String(port),HOSTNAME:'127.0.0.1'}});children.push(child);
 await new Promise((ok,bad)=>{child.on('error',bad);child.on('exit',code=>{if(!closing&&code)bad(Error('Web server exited'));else ok();});});
}catch(e){console.error(e.code==='FUNDING_REQUIRED'?e.message:e.message.startsWith('Web port')||e.message.startsWith('Sandbox RPC')||e.message.startsWith('Anvil')?e.message:'Profile startup stopped. Check its initialization, RPC and build. No private keys are printed.');process.exitCode=1;}finally{await stop();}
