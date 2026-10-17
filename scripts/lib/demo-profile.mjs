import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePrivateKey,privateKeyToAccount,mnemonicToAccount} from 'viem/accounts';
import {toHex} from 'viem';
export const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const roles=['relayer','source','supplier','buyer','lender'];
export function directory(profile){if(!['sandbox','testnet'].includes(profile))throw Error('Managed profile must be sandbox or testnet');return resolve(process.env.TRADERAIL_PROFILE_DIR||join(root,'.traderail',profile));}
export function secureWrite(path,value){mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});const temp=path+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(temp,0o600);renameSync(temp,path);}
export function accounts(profile){const dir=directory(profile);mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);const path=join(dir,'accounts.json');if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));if(saved.profile!==profile)throw Error('Profile account namespace mismatch');for(const role of roles)if(privateKeyToAccount(saved.keys[role]).address.toLowerCase()!==saved.addresses[role].toLowerCase())throw Error('Profile signer mismatch');chmodSync(path,0o600);return saved;}
 const keys=Object.fromEntries(roles.map((role,index)=>[role,profile==='sandbox'?toHex(mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:index}).getHdKey().privateKey):generatePrivateKey()]));
 const addresses=Object.fromEntries(roles.map(role=>[role,privateKeyToAccount(keys[role]).address]));const config={profile,keys,addresses};secureWrite(path,config);return config;}
export function publicConfig(profile){const path=join(directory(profile),'deployment.json');return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;}
export const webPort=profile=>Number(process.env.PORT||(profile==='sandbox'?3002:3004));
