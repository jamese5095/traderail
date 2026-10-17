import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const base=process.env.DEMO_URL??'http://localhost:3001';
const out=process.env.DEMO_REPORT??'deployments/traderail-v3-local-rehearsal.json';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function read(order){const r=await fetch(base+'/api/traderail'+(order?`?order=${order}`:''));const j=await r.json();if(!r.ok)throw Error(j.error);return j;}
async function post(body,expected=200,origin){const r=await fetch(base+'/api/traderail',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)});const j=await r.json();if(r.status!==expected)throw Error(`${r.status}: ${j.error??JSON.stringify(j)}`);return j;}
const modes=process.argv.includes('--one')?['direct','financed']:['direct','financed','direct','financed','direct','financed'];
const reports=[];const initial=await read();const protocol=initial.deployment.protocol.toLowerCase();
const resumeFrom=process.argv.find(x=>x.startsWith('--resume='))?.split('=')[1];
function validated(order,mode){
 if(order.mode!==mode||order.next!=='complete'||!order.paid||order.debt!=='0')throw Error('Round did not finish');
 if(mode==='direct'&&(order.proceeds!=='100000000000'||order.interestPaid!=='0'||order.advance!=='0'))throw Error('Direct accounting mismatch');
 if(mode==='financed'&&(order.proceeds!=='49000000000'||order.interestPaid!=='1000000000'||order.principalReturned!=='50000000000'||order.advance!=='50000000000'||order.escrow!=='0'))throw Error('Financing accounting mismatch');
 if(!order.operations.pay.transfers?.length||order.operations.pay.transfers.some(x=>!/^\d+$/.test(x.amount)))throw Error('Invalid token transfer evidence');
 const outgoing=order.operations.pay.transfers.filter(x=>x.from.toLowerCase()===protocol);
 if(outgoing.reduce((sum,x)=>sum+BigInt(x.amount),0n)!==100000000000n)throw Error('Transfer evidence does not conserve payment');
 return {mode,id:order.id,paid:order.paid,advance:order.advance,principalReturned:order.principalReturned,interestPaid:order.interestPaid,proceeds:order.proceeds,operations:order.operations,records:order.records,syncedAt:order.syncedAt};
}
function save(complete=false){writeFileSync(out,JSON.stringify({at:new Date().toISOString(),base,protocol,complete,reports,checks:['money accounting','Transfer conservation','duplicate creation/payment on executed rounds','wrong barcode','archived receipts','cross-origin denial','invalid mode'],resumeFrom},null,2)+'\n');}
if(resumeFrom){for(const h of initial.history.filter(h=>h.id>=resumeFrom&&h.paid)){if(reports.length>=modes.length)break;const o=(await read(h.id)).order;reports.push(validated(o,modes[reports.length]));}}
for(let index=reports.length;index<modes.length;index++){
 const mode=modes[index];let snap=await read();let id;
 if(resumeFrom&&snap.order&&snap.order.next!=='complete'){if(snap.order.mode!==mode)throw Error('Active order mode differs from resumed rehearsal');id=snap.order.id;}
 else{const createId=randomUUID();const start=await post({action:'create',mode,createId});id=start.order;const duplicate=await post({action:'create',mode,createId});if(duplicate.order!==id)throw Error('Duplicate creation changed identity');}
 let order;const deadline=Date.now()+240_000;let checkedBarcode=false;
 while(Date.now()<deadline){snap=await read();order=snap.order;if(order.id!==id)throw Error('Round identity changed');
  if(order.pending){if(order.pending.state==='failed')throw Error('Transaction reverted');await delay(900);continue;}
  if(order.next==='complete')break;
  if(order.next==='ship'&&!checkedBarcode){await post({action:'step',order:id,step:'ship',barcode:'WRONG'},409);checkedBarcode=true;}
  await post({action:'step',order:id,step:order.next});await delay(300);
 }
 const report=validated(order,mode);const original=order.operations.pay.hash;
 const replay=await post({action:'step',order:id,step:'pay'});if(replay.operation.hash!==original)throw Error('Duplicate payment changed transaction');
 const archived=(await read(id)).order;if(archived.operations.pay.hash!==original)throw Error('Historical receipt lost');
 reports.push(report);save();console.log(`PASS ${mode} ${id}: ${original}`);
}
await post({action:'create',mode:'direct',createId:randomUUID()},403,'https://example.com');await post({action:'create',mode:'invalid',createId:randomUUID()},400);
save(true);console.log(`PASS ${reports.length} completed rounds; report ${out}`);
