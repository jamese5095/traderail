import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {root} from './demo-profile.mjs';
export function webFingerprint(){const hash=createHash('sha256');function visit(dir){for(const entry of readdirSync(dir).sort()){if(entry==='node_modules'||entry.startsWith('.next')||entry==='.demo-sessions'||entry==='next-env.d.ts'||entry.endsWith('.tsbuildinfo')||entry.startsWith('.env'))continue;const file=join(dir,entry);if(statSync(file).isDirectory())visit(file);else{hash.update(relative(root,file));hash.update(readFileSync(file));}}}visit(join(root,'frontend'));visit(join(root,'backend'));for(const file of ['package.json','package-lock.json'])hash.update(readFileSync(join(root,file)));return hash.digest('hex');}
export function buildDirectory(){const name=process.env.TRADERAIL_BUILD_DIR||'.next';if(!/^\.next(?:-(?:sandbox|testnet))?$/.test(name))throw Error('Unsupported build directory');return name;}
