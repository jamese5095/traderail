import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
const base = process.env.DEMO_URL || 'http://127.0.0.1:3000';
const testnet = process.argv.includes('--testnet');
if (testnet && !process.argv.includes('--execute')) { console.log('Run with --testnet --execute to submit the five real test-only order transactions.'); process.exit(0); }
const count = Number(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || 1);
assert.ok(Number.isInteger(count) && count > 0 && count <= 3);
const U = 1000000n;
async function api(path, body, headers = {}) {
  const r = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function position(id) { const r=await api('/api/position'+(id?'?shipmentId='+id:'')); assert.equal(r.status,200,JSON.stringify(r.data)); return r.data; }
async function step(id, action) {
  const start=Date.now(); const body={shipmentId:id,step:action};
  const r=await api('/api/demo/step',body); assert.ok([200,202].includes(r.status),JSON.stringify(r)); assert.match(r.data.hash,/^0x[0-9a-f]{64}$/i);
  let state=r.data;
  for(let i=0;i<120 && state.state!=='confirmed';i++) {
    assert.notEqual(state.state,'failed'); await new Promise(resolve=>setTimeout(resolve,500));
    const status=await api('/api/transaction?hash='+r.data.hash);assert.equal(status.status,200);state=status.data;
  }
  assert.equal(state.state,'confirmed');
  const retry=await api('/api/demo/step',body);assert.equal(retry.data.hash,r.data.hash,'Retry must reuse original transaction');
  const proof=await api(`/api/evidence?shipmentId=${id}&hash=${r.data.hash}`);assert.equal(proof.status,200,JSON.stringify(proof));
  assert.equal(proof.data.status,'success');
  console.log(`PASS ${id}/${action}: ${r.data.hash}`);
  return {step:action,hash:r.data.hash,block:state.block,elapsedMs:Date.now()-start,proof:proof.data};
}
const reports=[];
try {
 for(let n=0;n<count;n++) {
  const before=await position();assert.equal(before.chainId,testnet?10143:31337);assert.equal(before.guidedDemo,true);assert.equal(before.position.status,'NONE');
  const id=before.position.shipmentId;const transactions=[];
  const bad=await api('/api/demo/step',{shipmentId:id,step:'settle'});assert.ok(bad.status>=400,'Payment before delivery rejected');
  const invalid=await api('/api/demo/step',{shipmentId:id,step:'borrow',amount:'1',to:before.supplier});assert.ok(invalid.status>=400,'No arbitrary amount or recipient accepted');
  const origin=await api('/api/demo/step',{shipmentId:id,step:'receive'},{origin:'https://untrusted.example'});assert.equal(origin.status,403);
  transactions.push(await step(id,'receive'));
  let p=await position();assert.equal(BigInt(p.position.availableCredit),80000n*U);
  transactions.push(await step(id,'borrow'));
  p=await position();assert.equal(BigInt(p.position.outstandingDebt),50000n*U);assert.equal(BigInt(p.supplierBalance)-BigInt(before.supplierBalance),50000n*U);
  const same=await Promise.all([api('/api/demo/step',{shipmentId:id,step:'borrow'}),api('/api/demo/step',{shipmentId:id,step:'borrow'})]);
  for(const r of same)assert.ok(r.data.hash===transactions[1].hash||r.status===409,'Concurrent duplicate cannot make another loan');
  assert.equal((await api('/api/demo/round',{shipmentId:id})).status,409,'Cannot reset before buyer settlement');
  transactions.push(await step(id,'outbound'));
  p=await position();assert.equal(BigInt(p.position.availableCredit),0n);assert.equal(BigInt(p.position.outstandingDebt),50000n*U);
  transactions.push(await step(id,'deliver'));
  p=await position();assert.equal(p.position.status,'DELIVERED');assert.equal(p.position.buyerPaid,false);assert.equal(BigInt(p.position.outstandingDebt),50000n*U);
  const done=await step(id,'settle');transactions.push(done);
  p=await position();assert.equal(p.position.status,'CLOSED');assert.equal(p.position.buyerPaid,true);assert.equal(BigInt(p.position.outstandingDebt),0n);
  assert.equal(BigInt(p.position.principalRepaid),50000n*U);assert.equal(BigInt(p.position.supplierProceeds),50000n*U);
  assert.equal(BigInt(before.buyerBalance)-BigInt(p.buyerBalance),100000n*U);assert.equal(p.poolBalance,before.poolBalance);
  assert.equal(BigInt(p.supplierBalance)-BigInt(before.supplierBalance),100000n*U,'Cumulative wallet includes loan and net sales proceeds; not profit');
  assert.deepEqual(p.timeline.map(e=>e.eventType),['GOODS_RECEIVED','BORROW','GOODS_OUTBOUND','DELIVERED','ORDER_SETTLED']);
  const logs=done.proof.transfers;
  assert.ok(logs.some(t=>String(t.args.from).toLowerCase()===p.position.buyer.toLowerCase()&&String(t.args.to).toLowerCase()===p.protocol.toLowerCase()&&t.args.amount===String(100000n*U)));
  assert.ok(logs.some(t=>String(t.args.from).toLowerCase()===p.protocol.toLowerCase()&&String(t.args.to).toLowerCase()===p.position.supplier.toLowerCase()&&t.args.amount===String(50000n*U)));
  const event=done.proof.events.find(e=>e.name==='OrderSettled');assert.ok(event);assert.equal(event.args.principal,String(50000n*U));
  const historical=await api(`/api/evidence?shipmentId=${id}&hash=${transactions[1].hash}`);assert.equal(historical.status,200);assert.deepEqual(historical.data.balancesAtBlock,transactions[1].proof.balancesAtBlock);
  const reset=await api('/api/demo/round',{shipmentId:id});assert.equal(reset.status,200,JSON.stringify(reset));
  const active=await position();assert.equal(active.position.status,'NONE');assert.equal(active.position.buyerPaid,false);assert.notEqual(active.position.shipmentId,id);
  const archived=await position(id);assert.equal(archived.position.status,'CLOSED');assert.equal(archived.position.buyerPaid,true);
  const wrong=await api(`/api/evidence?shipmentId=${active.position.shipmentId}&hash=${done.hash}`);assert.equal(wrong.status,404);
  reports.push({shipmentId:id,nextShipmentId:active.position.shipmentId,transactions:transactions.map(({proof,...tx})=>({...tx,snapshotSource:proof.snapshotSource})),finalPosition:p.position});
 }
 const deployment=JSON.parse(readFileSync(new URL('../frontend/lib/deployment.json',import.meta.url)));
 writeFileSync(new URL(testnet?'../deployments/testnet-rehearsal-v2.json':'../deployments/local-rehearsal-v2.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),chainId:deployment.chainId,protocol:deployment.protocol,rounds:reports},null,2)+'\n');
 console.log(`PASS ${count} guided order round(s): buyer payment, atomic principal repayment, exact transfers, idempotency, immutable evidence and replay.`);
} catch(error) { console.error(error instanceof Error?error.message:'Guided rehearsal failed');process.exitCode=1; }
