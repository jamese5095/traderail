export type PayMode='direct'|'factoring';
export type PayStep='deliver'|'approve'|'quote'|'purchase'|'mature'|'settle';
export type PayOperation={step:PayStep;state:'submitted'|'confirming'|'confirmed'|'failed'|'unknown';hash:string;block?:string;gasUsed?:string;submittedAt:string;confirmedAt?:string;transfers?:{from:string;to:string;amount:string}[]};
export type PayOrder={id:string;chainOrderId?:string;mode:PayMode;createdAt:string;document:{id:string;goods:string;quantity:number;source:string;hash:string};dueAt?:number;operations:Partial<Record<PayStep,PayOperation>>;next:PayStep|'complete';paired:boolean;lastSeen?:number;holder:string;approved:boolean;purchased:boolean;settled:boolean;demoMatured:boolean};
export type PaySnapshot={order:PayOrder|null;history:{id:string;mode:PayMode;settled:boolean}[];deployment:{protocol:string;usdc:string;buyer:string;supplier:string;lender:string;chainId:number;network:string};readiness?:{buyer:string;lender:string};};
