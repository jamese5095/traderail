import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseGwei} from 'viem';
import {accounts,directory} from './lib/demo-profile.mjs';
import {fundingPlan,compileDemo} from './lib/prepare-demo.mjs';

test('managed accounts persist privately and separate independent testnet instances',()=>{
 const old=process.env.TRADERAIL_PROFILE_DIR;const first=mkdtempSync(join(tmpdir(),'traderail-profile-'));const second=mkdtempSync(join(tmpdir(),'traderail-profile-'));
 try{process.env.TRADERAIL_PROFILE_DIR=first;const a=accounts('testnet');assert.deepEqual(accounts('testnet'),a);assert.equal(new Set(Object.values(a.addresses)).size,5);assert.equal(statSync(join(first,'accounts.json')).mode&0o777,0o600);assert.equal(statSync(first).mode&0o777,0o700);process.env.TRADERAIL_PROFILE_DIR=second;assert.notEqual(accounts('testnet').addresses.relayer,a.addresses.relayer);}
 finally{if(old===undefined)delete process.env.TRADERAIL_PROFILE_DIR;else process.env.TRADERAIL_PROFILE_DIR=old;rmSync(first,{recursive:true,force:true});rmSync(second,{recursive:true,force:true});}
});
test('unsupported profiles cannot generate managed state',()=>{assert.throws(()=>directory('showcase'));assert.throws(()=>directory('mainnet'));});
test('funding target includes every signing role and avoids duplicate topups',()=>{
 const first=fundingPlan(parseGwei('102'));assert.deepEqual(Object.keys(first.topups).sort(),['buyer','lender','source','supplier']);assert.ok(first.required>Object.values(first.topups).reduce((a,b)=>a+b,0n));const funded=fundingPlan(parseGwei('102'),first.targets);assert.ok(Object.values(funded.topups).every(n=>n===0n));assert.ok(funded.required<first.required);
});
test('both artifacts compile with the current protocol interface',()=>{const a=compileDemo();assert.ok(a.MockUSDC.bytecode.length>100);for(const name of ['recordDelivery','approvePayable','offerQuote','purchase','settle','advanceDemoMaturity'])assert.ok(a.TradeRailPayables.abi.some(x=>x.type==='function'&&x.name===name));});
