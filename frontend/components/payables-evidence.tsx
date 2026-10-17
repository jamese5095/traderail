'use client';

import {ArrowUpRight,CheckCheck,Clock3,RefreshCw,ShieldCheck} from 'lucide-react';
import {formatUnits} from 'viem';
import type {PayOperation,PayOrder,PaySnapshot,PayStep} from '@/lib/payables-types';
import s from './payables-evidence.module.css';

type Props={
  order?:PayOrder|null;
  deployment?:PaySnapshot['deployment']|null;
  locale:string;
  financed:boolean;
  names:Record<PayStep,string>;
  status:(operation?:PayOperation)=>string;
  explorer:(kind:string,id:string)=>string;
  onReplay?:()=>void;
};
const short=(value:string)=>value.slice(0,8)+'…'+value.slice(-6);

export function PayablesEvidence({order,deployment,locale,financed,names,status,explorer,onReplay}:Props){
  const say=(zh:string,en:string)=>locale==='zh'?zh:en;
  const steps:PayStep[]=financed?['deliver','approve','quote','purchase','mature','settle']:['deliver','approve','mature','settle'];
  const confirmed=steps.filter(step=>order?.operations[step]?.state==='confirmed').length;
  const role=(address:string)=>{
    const match=Object.entries({buyer:say('买方','Buyer'),supplier:say('供应商','Supplier'),lender:say('资金方','Financier'),protocol:'TradeRail'})
      .find(([key])=>deployment?.[key as 'buyer'|'supplier'|'lender'|'protocol'].toLowerCase()===address.toLowerCase());
    return match?.[1]??short(address);
  };
  const addressLink=(address:string)=><a href={explorer('address',address)} title={address} target="_blank" rel="noreferrer">{role(address)}</a>;

  return <section id="order-evidence" className={s.panel} aria-labelledby="order-evidence-heading">
    <header className={s.heading}>
      <div><ShieldCheck size={21}/><div><h2 id="order-evidence-heading">{say('本笔完整链上证据','Complete order evidence')}</h2><p>{say('随业务流程更新，每一步都可独立核验。','Updated with the workflow. Verify each transaction independently.')}</p></div></div>
      <div className={s.headingActions}>
        <span className={s.count} role="status">{confirmed} / {steps.length} {say('已确认','confirmed')}</span>
        {onReplay&&<button type="button" onClick={onReplay}><RefreshCw size={14}/>{say('回放已确认转账','Replay confirmed transfer')}</button>}
      </div>
    </header>
    <div className={s.context}>
      <span>{say('订单','Order')} <b>{order?.id??'—'}</b></span>
      <span>{deployment?.networkName??'…'}</span>
      {deployment&&<a href={explorer('address',deployment.protocol)} title={deployment.protocol} target="_blank" rel="noreferrer">{say('结算合约','Settlement contract')} <code>{short(deployment.protocol)}</code><ArrowUpRight size={13}/></a>}
    </div>
    <div className={s.columnLabels} aria-hidden="true"><span>{say('业务步骤 / 状态','STEP / STATUS')}</span><span>{say('完整交易哈希','FULL TRANSACTION HASH')}</span><span>{say('链上回执','RECEIPT')}</span><span>{say('USDC 资金转账','USDC TRANSFERS')}</span></div>
    <ol className={s.rows}>
      {steps.map((step,index)=>{
        const op=order?.operations[step];
        const done=op?.state==='confirmed';
        const active=order?.next===step;
        const state=op?status(op):!order?say('尚未创建订单','No order yet'):active?say('等待操作','Awaiting action'):say('待前序完成','Awaiting previous steps');
        return <li key={step} className={`${s.row} ${done?s.confirmed:op?.state==='failed'?s.failed:op||active?s.active:s.waiting}`}>
          <div className={s.step}><span className={s.stepIndex}>{done?<CheckCheck size={16}/>:String(index+1).padStart(2,'0')}</span><div><h3>{names[step]}</h3><span className={s.state}>{state}</span></div></div>
          <div className={s.hash}>{op?<a href={explorer('tx',op.hash)} title={op.hash} target="_blank" rel="noreferrer"><code>{op.hash}</code><ArrowUpRight size={14}/></a>:<span className={s.placeholder}>{say('执行后生成交易哈希','Transaction hash appears after submission')}</span>}</div>
          <div className={s.receipt}>{op?.block?<a href={explorer('block',op.block)} target="_blank" rel="noreferrer">{say('区块','Block')} #{op.block}<ArrowUpRight size={12}/></a>:<span className={s.placeholder}>{op?say('等待入块','Awaiting inclusion'):'—'}</span>}{op?.gasUsed&&<small>Gas {Number(op.gasUsed).toLocaleString('en-US')}</small>}{done&&op?.confirmedAt&&<time dateTime={op.confirmedAt} title={op.confirmedAt}>{new Date(op.confirmedAt).toLocaleTimeString(locale==='zh'?'zh-CN':'en-GB')}</time>}</div>
          <div className={s.transfers}>{done?op?.transfers?.length?op.transfers.map((transfer,i)=><div key={i} className={s.transfer}><b>{Number(formatUnits(BigInt(transfer.amount),6)).toLocaleString(locale==='zh'?'zh-CN':'en-US',{maximumFractionDigits:6})} USDC</b><span>{addressLink(transfer.from)}<ArrowUpRight size={12}/>{addressLink(transfer.to)}</span></div>):<span className={s.placeholder}>{say('本步骤无 USDC 转账','No USDC transfer in this step')}</span>:<span className={s.placeholder}>{op?.state==='failed'?say('交易失败，无到账结果','Reverted; no funds received'):op?say('确认后展示实际转账','Transfers appear after confirmation'):'—'}</span>}</div>
        </li>;
      })}
    </ol>
    <footer className={s.note}><Clock3 size={13}/><span>{!order?say('创建订单后，从交付凭证到最终结算的交易证据将在这里依次呈现。','Create an order to see evidence from delivery through final settlement.'):deployment?.chainId===31337?say('交易、区块与转账来自本地 EVM 沙盒；不代表 Monad 测试网记录。','Transactions, blocks and transfers come from the local EVM sandbox, not Monad Testnet.'):say('仅在交易回执确认后展示到账结果；企业业务凭证由模拟服务提供。','Funds received are shown only after receipt confirmation. Enterprise records are simulated.')}</span></footer>
  </section>;
}
