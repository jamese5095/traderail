import {randomUUID}from'node:crypto';import{writeFileSync}from'node:fs';
const base=process.env.DEMO_URL??'http://localhost:3001';const failure=process.env.FAILURE_URL??'http://localhost:3002';
async function get(){const r=await fetch(base+'/api/traderail');const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
async function post(host,body){const r=await fetch(host+'/api/traderail',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
let x=await post(base,{action:'create',mode:'direct',createId:randomUUID()});if(x.status!==200)throw Error(x.body.error);
let o;for(let i=0;i<20;i++){o=(await get()).order;if(o.pending){await new Promise(r=>setTimeout(r,200));continue;}if(o.next==='sync')break;x=await post(base,{action:'step',order:o.id,step:o.next});if(x.status!==200)throw Error(x.body.error);}
if(!o.paid||o.next!=='sync')throw Error('Payment not settled');const hash=o.operations.pay.hash;
x=await post(failure,{action:'step',order:o.id,step:'sync'});if(x.status!==503)throw Error('Writeback failure not injected');o=(await get()).order;if(!o.paid||o.syncedAt||o.operations.pay.hash!==hash)throw Error('Writeback failure changed payment');
x=await post(base,{action:'step',order:o.id,step:'sync'});if(x.status!==200)throw Error(x.body.error);o=(await get()).order;if(o.next!=='complete'||o.operations.pay.hash!==hash)throw Error('Sync retry sent payment again');writeFileSync('deployments/traderail-v3-recovery.json',JSON.stringify({order:o.id,paymentHash:hash,writebackFailed:true,retrySynced:true,unchangedPaymentHash:true},null,2)+'\n');console.log('PASS payment confirmed → ERP writeback failure → sync-only recovery; original payment preserved');
