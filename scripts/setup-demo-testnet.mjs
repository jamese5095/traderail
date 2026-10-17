import {prepareDemo} from './lib/prepare-demo.mjs';
const flags=new Set(process.argv.slice(2));
if([...flags].some(x=>!['--prepare-only','--wait'].includes(x))){console.error('Usage: npm run setup:demo:testnet -- [--prepare-only|--wait]');process.exit(1);}
try{await prepareDemo('testnet',{prepareOnly:flags.has('--prepare-only'),waitForFunds:flags.has('--wait')});}catch(e){console.error(e.code==='FUNDING_REQUIRED'?e.message:'Initialization stopped. Check RPC, available testnet MON and profile permissions. No private keys are printed.');process.exitCode=e.code==='FUNDING_REQUIRED'?2:1;}
