import { readFileSync,writeFileSync,chmodSync,renameSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
const file=new URL('../.env',import.meta.url);let content=readFileSync(file,'utf8');const env=parseEnv(content);const added=[];
if(!env.LENDER_PRIVATE_KEY){if(env.LENDER_ADDRESS)throw Error('Existing lender address has no key; identity not replaced');env.LENDER_PRIVATE_KEY=generatePrivateKey();content+='\nLENDER_PRIVATE_KEY='+env.LENDER_PRIVATE_KEY+'\n';added.push('LENDER_PRIVATE_KEY');}
let account;try{account=privateKeyToAccount(env.LENDER_PRIVATE_KEY);}catch{throw Error('Lender test configuration invalid; credentials not printed');}
if(env.LENDER_ADDRESS&&env.LENDER_ADDRESS.toLowerCase()!==account.address.toLowerCase())throw Error('Lender identity mismatch');
if(!env.LENDER_ADDRESS){content+='LENDER_ADDRESS='+account.address+'\n';added.push('LENDER_ADDRESS');}
if(added.length){const temp=new URL('../.env.v3.tmp',import.meta.url);writeFileSync(temp,content,{mode:0o600,flag:'wx'});renameSync(temp,file);}chmodSync(file,0o600);
console.log(JSON.stringify({lender:account.address,addedFields:added,existingRolesPreserved:true}));
