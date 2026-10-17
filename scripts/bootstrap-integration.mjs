// Tests the testnet initializer on a disposable local chain with testnet chain ID.
// This does not claim execution on the public Monad network.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {createPublicClient,defineChain,http,parseEther} from 'viem';
import {accounts} from './lib/demo-profile.mjs';
import {prepareDemo} from './lib/prepare-demo.mjs';
const port=8547;const available=await new Promise(r=>{const s=net.createServer();s.once('error',()=>r(false));s.listen(port,'127.0.0.1',()=>s.close(()=>r(true)));});if(!available)throw Error('Test port 8547 is busy; no existing process was stopped');
const dir=mkdtempSync(join(tmpdir(),'traderail-bootstrap-'));process.env.TRADERAIL_PROFILE_DIR=dir;
const rpc='http://127.0.0.1:'+port;const node=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','10143','--hardfork','cancun','--block-time','1','--slots-in-an-epoch','1','--silent'],{stdio:'ignore'});let failed=false;node.on('error',()=>{failed=true;});
const chain=defineChain({id:10143,name:'Disposable initialization test',nativeCurrency:{name:'TEST','symbol':'TEST',decimals:18},rpcUrls:{default:{http:[rpc]}}});const client=createPublicClient({chain,transport:http(rpc,{timeout:2000,retryCount:0})});
try{
 for(let i=0;i<60;i++){if(failed)throw Error('Anvil is required');try{if(await client.getChainId()===10143)break;}catch{}if(i===59)throw Error('Test chain startup timed out');await new Promise(r=>setTimeout(r,200));}
 const before=await client.getBlockNumber();const prep=await prepareDemo('testnet',{rpcOverride:rpc,prepareOnly:true});assert.ok(prep.prepared);assert.equal(await client.getTransactionCount({address:prep.fundingAddress}),0);
 await assert.rejects(()=>prepareDemo('testnet',{rpcOverride:rpc}),e=>e.code==='FUNDING_REQUIRED');
 await client.request({method:'anvil_setBalance',params:[prep.fundingAddress,'0x'+parseEther('2').toString(16)]});
 const meta=await prepareDemo('testnet',{rpcOverride:rpc});assert.ok(await client.getCode({address:meta.protocol}));
 const config=accounts('testnet');for(const role of ['source','supplier','buyer','lender'])assert.ok(await client.getBalance({address:config.addresses[role]})>0n);
 const nonce=await client.getTransactionCount({address:prep.fundingAddress});const resumed=await prepareDemo('testnet',{rpcOverride:rpc});assert.equal(resumed.protocol,meta.protocol);assert.equal(await client.getTransactionCount({address:prep.fundingAddress}),nonce);
 rmSync(join(dir,'deployment.json'));const recovered=await prepareDemo('testnet',{rpcOverride:rpc});assert.equal(recovered.protocol,meta.protocol);assert.equal(await client.getTransactionCount({address:prep.fundingAddress}),nonce);
 console.log('PASS bootstrap integration: unfunded prepare, funding gate, every role funded, deployment, resume and journal recovery; local chain only');
}finally{node.kill('SIGTERM');await new Promise(r=>node.exitCode!==null?r():node.once('exit',r));rmSync(dir,{recursive:true,force:true});}
