import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTerms,usdcUnits,unitsString,formatMoney,termsFor} from '../frontend/lib/payables-terms.ts';
test('exact six-decimal USDC accounting and allocation',()=>{
 const terms=normalizeTerms('factoring',{face:'120000.123456',principal:'40000.000001',interest:'800.000002'});
 const repayment=usdcUnits(terms.principal)+usdcUnits(terms.interest);
 assert.equal(unitsString(repayment),'40800.000003');
 assert.equal(unitsString(usdcUnits(terms.face)-repayment),'79200.123453');
 assert.equal(formatMoney(usdcUnits(terms.face)-usdcUnits(terms.interest)),'119,200.123454');
});
test('direct payment removes financing terms and normalizes decimal zeros',()=>{
 assert.deepEqual(normalizeTerms('direct',{face:'75000.120000',principal:'50000',interest:'1000'}),{face:'75000.12',principal:'0',interest:'0'});
 assert.equal(termsFor({mode:'direct'}).face,'100000');
});
test('reject malformed amounts, excess decimals, invalid loan bounds and oversize funding',()=>{
 for(const face of ['0','-1','NaN','Infinity','1e5','1.0000001','01','1000000.000001','1000000000000000000000000000'])assert.throws(()=>normalizeTerms('direct',{face,principal:'0',interest:'0'}));
 for(const [principal,interest] of [['0','0'],['100','0'],['101','0'],['90','10.000001'],['50','-1']])assert.throws(()=>normalizeTerms('factoring',{face:'100',principal,interest}));
 assert.deepEqual(normalizeTerms('factoring',{face:'100',principal:'90',interest:'10'}),{face:'100',principal:'90',interest:'10'});
});
