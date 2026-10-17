import test from 'node:test';
import assert from 'node:assert/strict';
import {createChainOrderId,chainOrderId} from '../backend/lib/order-identity.ts';
import {keccak256,stringToHex} from 'viem';
test('restarting the same display number gets independent protocol identities',()=>{
 const ids=Array.from({length:1000},()=>chainOrderId({id:'PAY-0001',chainOrderId:createChainOrderId()}));
 assert.equal(new Set(ids).size,1000);assert.ok(ids.every(id=>/^0x[0-9a-f]{64}$/.test(id)));
});
test('retries resolve the same stored protocol identity',()=>{
 const o={id:'PAY-0001',chainOrderId:createChainOrderId()};
 assert.equal(chainOrderId(o),chainOrderId(JSON.parse(JSON.stringify(o))));
 assert.notEqual(chainOrderId(o),keccak256(stringToHex(o.id)));
});
test('explicitly restored legacy orders retain their original protocol key',()=>{
 assert.equal(chainOrderId({id:'PAY-0001'}),keccak256(stringToHex('PAY-0001')));
});
