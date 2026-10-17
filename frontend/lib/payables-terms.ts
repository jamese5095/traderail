/** Decimal strings keep the configured USDC amounts exact at six decimals. */
export type PayTerms={face:string;principal:string;interest:string};
export const DEFAULT_TERMS:PayTerms={face:'100000',principal:'50000',interest:'1000'};
export function usdcUnits(value:string):bigint {
 if(!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(value))throw Error('请输入有效金额，最多六位小数 / Use a positive amount with up to 6 decimals');
 const [whole,decimal='']=value.split('.');return BigInt(whole)*1000000n+BigInt(decimal.padEnd(6,'0'));
}
export function unitsString(value:bigint):string {const whole=value/1000000n;const decimal=(value%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return whole.toString()+(decimal?'.'+decimal:'');}
export function normalizeTerms(mode:'direct'|'factoring',input:PayTerms=DEFAULT_TERMS):PayTerms {
 const face=usdcUnits(input.face);if(face<=0n||face>1000000000000n)throw Error('货款应大于 0 且不超过 1,000,000 USDC / Trade value must be within 0–1,000,000 USDC');
 if(mode==='direct')return {face:unitsString(face),principal:'0',interest:'0'};
 const principal=usdcUnits(input.principal),interest=usdcUnits(input.interest);
 if(principal<=0n||principal>=face)throw Error('贷款本金须大于 0 且小于货款 / Principal must be positive and below trade value');
 if(principal+interest>face)throw Error('本金与利息合计不能超过货款 / Repayment cannot exceed trade value');
 return {face:unitsString(face),principal:unitsString(principal),interest:unitsString(interest)};
}
export function termsFor(order?:{mode:'direct'|'factoring';terms?:PayTerms}|null):PayTerms {return normalizeTerms(order?.mode??'factoring',order?.terms??DEFAULT_TERMS);}
export function formatMoney(value:string|bigint):string {const str=typeof value==='bigint'?unitsString(value):value;const [whole,decimal]=str.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal?'.'+decimal:'');}
