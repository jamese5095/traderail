import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationState, confirmedMotions } from '../frontend/lib/rail-presentation.ts';
import type { RailOrderView } from '../frontend/lib/rail-types.ts';

function order(overrides: Partial<RailOrderView> = {}): RailOrderView {
  return { id:'TRD-TEST',mode:'financed',createdAt:'2026-10-17T00:00:00Z',records:[],operations:{},next:'ship',escrow:'0',advance:'0',principalReturned:'0',interestPaid:'0',proceeds:'0',paid:false,debt:'0',...overrides };
}
test('latest-state advance is never displayed or animated before a confirmed receipt', () => {
  const data=order({advance:'50000000000',debt:'51000000000',operations:{advance:{step:'advance',state:'confirming',hash:'0xpending'}}});
  assert.equal(presentationState(data,'financed').advance,0);
  assert.equal(presentationState(data,'financed').advanced,false);
  assert.deepEqual(confirmedMotions(data),[]);
});
test('a latest-state paid flag cannot erase visible debt before the payment receipt is finalized', () => {
  const data=order({records:[{id:'accepted',kind:'accepted',at:'2026-10-17',commitment:'0xrecord'}],advance:'50000000000',paid:true,debt:'0',proceeds:'49000000000',interestPaid:'1000000000',operations:{advance:{step:'advance',state:'confirmed',hash:'0xadvance'},pay:{step:'pay',state:'unknown',hash:'0xpay'}}});
  const state=presentationState(data,'financed');assert.equal(state.paid,false);assert.equal(state.proceeds,0);assert.equal(state.total,50000);assert.equal(state.debt,51000);
  assert.deepEqual(confirmedMotions(data).map(x=>x.step),['advance']);
});
test('financing shows advance plus remainder without double counting the buyer payment', () => {
  const data=order({advance:'50000000000',paid:true,proceeds:'49000000000',principalReturned:'50000000000',interestPaid:'1000000000',syncedAt:'2026-10-17',operations:{advance:{step:'advance',state:'confirmed',hash:'0xa'},pay:{step:'pay',state:'confirmed',hash:'0xp'}}});
  const state=presentationState(data,'financed');assert.equal(state.total,99000);assert.equal(state.principal+state.interest+state.proceeds,100000);assert.equal(state.debt,0);assert.equal(state.synced,true);
});
test('business acceptance changes the scene, without inventing a loan or cash movement', () => {
  const data=order({next:'fund',records:[{id:'accepted',kind:'accepted',at:'2026-10-17',commitment:'0xc'}]});
  const state=presentationState(data,'financed');assert.equal(state.act,1);assert.equal(state.boundary,'pay');assert.equal(state.advanced,false);assert.equal(state.total,0);assert.deepEqual(state.done,[true,false,false]);
});
test('buyer payment and ERP reconciliation are separate, also in direct mode', () => {
  const data=order({mode:'direct',paid:true,proceeds:'100000000000',operations:{pay:{step:'pay',state:'confirmed',hash:'0xp'}}});
  const state=presentationState(data,'financed');assert.equal(state.financed,false);assert.equal(state.total,100000);assert.equal(state.debt,0);assert.equal(state.synced,false);
});
