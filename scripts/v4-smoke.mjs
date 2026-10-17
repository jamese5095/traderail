// Real TESTNET rehearsal. Uses mock tokens, retains receipts; never prints cookies or signed payloads.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
const base=process.env.DEMO_BASE_URL||'http://localhost:3000';let cookie='';
async function call(path,body,phone=false,expected=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(phone?{cookie}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,expected,d.error);return {d,r};}
async function state(){return(await call('/api/payables')).d;}
async function wait(step){for(let i=0;i<70;i++){const s=await state();const op=s.order.operations[step];if(op?.state==='confirmed')return s;assert.notEqual(op?.state,'failed');await new Promise(r=>setTimeout(r,1500));}throw Error('Timed out awaiting '+step);}
const results=[];
for(const mode of ['factoring','direct']){
const createId=randomUUID();const created=(await call('/api/payables',{action:'create',mode,createId})).d;assert.equal((await call('/api/payables',{action:'create',mode,createId})).d.order,created.order);const id=created.order;
await call('/api/field',undefined,true,401);
const pairing=(await call('/api/payables/pair',{})).d;const token=new URL(pairing.url).hash.slice(6);const paired=await call('/api/field/pair',{token});cookie=paired.r.headers.get('set-cookie').split(';')[0];await call('/api/field/pair',{token},false,401);
await call('/api/field',{action:'step',order:id,step:'approve'},true,400);
await call('/api/payables',{action:'step',order:id,step:'purchase'},false,403);
await call('/api/field',{action:'step',order:id,step:'deliver',barcode:'WRONG'},true,409);
const steps=mode==='factoring'?['deliver','approve','quote','purchase','mature','settle']:['deliver','approve','mature','settle'];
for(const step of steps){const phone=['deliver','purchase'].includes(step);const body={action:'step',order:id,step,...(step==='deliver'?{barcode:'TR-SENSOR-100'}:{})};const op=(await call(phone?'/api/field':'/api/payables',body,phone)).d.operation;const repeated=(await call(phone?'/api/field':'/api/payables',body,phone)).d.operation;assert.equal(op.hash,repeated.hash);const snap=await wait(step);console.log(`${id} ${step} confirmed ${op.hash}`);if(step==='purchase'){assert.equal(snap.order.funded,true);assert.equal(snap.order.operations.purchase.transfers[0].amount,'50000000000');}}
const final=await state();assert.equal(final.order.settled,true);assert.equal(final.order.next,'complete');const transfers=final.order.operations.settle.transfers;
if(mode==='factoring'){assert.equal(transfers.length,2);assert.equal(transfers[0].amount,'51000000000');assert.equal(transfers[0].to.toLowerCase(),final.deployment.lender.toLowerCase());assert.equal(transfers[1].amount,'49000000000');assert.equal(transfers[1].to.toLowerCase(),final.deployment.supplier.toLowerCase());}else{assert.equal(transfers.length,1);assert.equal(transfers[0].amount,'100000000000');assert.equal(transfers[0].to.toLowerCase(),final.deployment.supplier.toLowerCase());}results.push(final);
}
writeFileSync(process.env.DEMO_RESULTS_PATH||new URL('../deployments/traderail-v4-rehearsal.json',import.meta.url),JSON.stringify({verifiedAt:new Date().toISOString(),checks:['role isolation','one-use pairing','wrong goods rejected','idempotent creation and submissions','real transfers and finality','partial loan: 50000 disbursed, 51000 principal and interest, 49000 remainder','direct payment','history retained'],results},null,2));console.log('Both modes passed. Receipt evidence saved.');
