import {spawnSync} from 'node:child_process';
import {mkdirSync,cpSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {root} from './lib/demo-profile.mjs';
const require=createRequire(import.meta.url);mkdirSync(join(root,'site/public/images'),{recursive:true});cpSync(join(root,'frontend/public/images/warehouse-scanning.jpg'),join(root,'site/public/images/warehouse-scanning.jpg'));
const result=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build',join(root,'site'),'--webpack'],{cwd:root,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',PAGES_BASE_PATH:process.env.PAGES_BASE_PATH??'/traderail'}});
if(result.status!==0)process.exit(result.status??1);writeFileSync(join(root,'site/out/.nojekyll'),'');
