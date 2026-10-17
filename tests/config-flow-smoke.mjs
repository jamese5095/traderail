import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.DEMO_BASE_URL||'http://localhost:3013';let cookie='';
async function call(path,body,phone=false,expected=200){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(phone?{cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,expected,data.error);return{data,response};}
const state=async()=>(await call('/api/payables')).data;
async function mineFinality(){const r=await fetch('http://127.0.0.1:8548',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'anvil_mine',params:['0x40']})});const d=await r.json();assert.equal(d.error,undefined);}
const environment=(await call('/api/environment')).data;assert.equal(environment.chainId,31337,'This smoke test must use a disposable local chain');
async function wait(step){for(let i=0;i<30;i++){const snap=await state();const op=snap.order.operations[step];assert.notEqual(op?.state,'failed');if(op?.state==='confirmed')return snap;await new Promise(r=>setTimeout(r,150));}throw Error('Confirmation timeout: '+step);}
const cases=[{mode:'factoring',terms:{face:'120000.123456',principal:'40000.000001',interest:'800.000002'},payments:['40800000003','79200123453']},{mode:'direct',terms:{face:'75000.12',principal:'0',interest:'0'},payments:['75000120000']}];
for(const c of cases){
 const createId=randomUUID();await call('/api/payables',{action:'create',mode:c.mode,terms:{...c.terms,face:'-10'},createId},false,400);
 const created=(await call('/api/payables',{action:'create',mode:c.mode,terms:c.terms,createId})).data;
 assert.equal((await call('/api/payables',{action:'create',mode:c.mode,terms:c.terms,createId})).data.order,created.order);
 await call('/api/payables',{action:'create',mode:c.mode,terms:{...c.terms,face:'150000'},createId},false,409);
 const id=created.order;
 if(c.mode==='factoring'){
  const before=(await state()).order.document.hash;
  await call('/api/payables',{action:'mode',mode:'direct',terms:{face:'70000',principal:'0',interest:'0'},order:id});
  assert.notEqual((await state()).order.document.hash,before);
  await call('/api/payables',{action:'mode',mode:c.mode,terms:c.terms,order:id});
 }
 const pairing=(await call('/api/payables/pair',{})).data;const token=new URL(pairing.url).hash.slice(6);
 cookie=(await call('/api/field/pair',{token})).response.headers.get('set-cookie').split(';')[0];
 const phone=(await call('/api/field',undefined,true)).data;assert.deepEqual(phone.order.terms,c.terms);
 for(const step of c.mode==='factoring'?['deliver','approve','quote','purchase','mature','settle']:['deliver','approve','mature','settle']){
  const mobile=['deliver','purchase'].includes(step);const body={action:'step',order:id,step,...(step==='deliver'?{barcode:'TR-SENSOR-100'}:{})};
  const first=(await call(mobile?'/api/field':'/api/payables',body,mobile)).data;
  assert.equal((await call(mobile?'/api/field':'/api/payables',body,mobile)).data.operation.hash,first.operation.hash);
  await mineFinality();const snap=await wait(step);
  if(step==='deliver')await call('/api/payables',{action:'mode',mode:c.mode,terms:{...c.terms,face:'160000'},order:id},false,409);
  if(step==='purchase')assert.equal(snap.order.operations.purchase.transfers[0].amount,'40000000001');
 }
 const final=(await state()).order;assert.equal(final.settled,true);assert.deepEqual(final.operations.settle.transfers.map(x=>x.amount),c.payments);
 console.log(c.mode+': custom amounts, exact transfers, immutable submitted terms, phone sync and idempotency passed.');
}
console.log('Both configurable settlement flows passed on disposable local EVM.');
