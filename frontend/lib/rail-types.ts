export type RailMode='direct'|'financed';
export type RailStep='register'|'ship'|'accept'|'fund'|'advance'|'pay'|'sync'|'complete';
export type RailRecord={id:string;kind:string;at:string;commitment:string;signature?:string;event?:Record<string,string|number>;verified?:boolean};
export type RailTransfer={from:string;to:string;amount:string};
export type RailOperation={step:string;state:string;evidenceVersion?:number;hash?:string;block?:string;error?:string;submittedAt?:string;confirmedAt?:string;transfers?:RailTransfer[];gasUsed?:string};
export type RailOrderView={id:string;mode:RailMode;createdAt:string;records:RailRecord[];operations:Record<string,RailOperation>;syncedAt?:string;next:RailStep;pending?:RailOperation;termsHash?:string;escrow:string;advance:string;principalReturned:string;interestPaid:string;proceeds:string;paid:boolean;debt:string};
export type RailSnapshot={order:RailOrderView|null;history:{id:string;mode:RailMode;paid:boolean}[];active:string|null;archived:boolean;enabled:boolean;deployment:{protocol:string;usdc:string;buyer:string;supplier:string;lender:string;source:string;relayer:string;chainId:number;network:string;preparations:{label:string;hash:string}[]};readiness:{buyerBalance:string;lenderBalance:string;buyerAllowance:string;lenderAllowance:string};};
