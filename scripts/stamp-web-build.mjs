import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {root} from './lib/demo-profile.mjs';
import {webFingerprint,buildDirectory} from './lib/web-build.mjs';
writeFileSync(join(root,'frontend',buildDirectory(),'traderail-source-hash'),webFingerprint());
