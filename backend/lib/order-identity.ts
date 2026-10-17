import {randomBytes} from 'node:crypto';
import {keccak256,stringToHex,type Hex} from 'viem';
/** Display numbers can restart; the protocol key must remain independent. */
export function createChainOrderId():Hex{return ('0x'+randomBytes(32).toString('hex')) as Hex;}
/** Preserve compatibility if an older saved order is explicitly restored. */
export function chainOrderId(order:{id:string;chainOrderId?:string}):Hex{return (order.chainOrderId??keccak256(stringToHex(order.id))) as Hex;}
