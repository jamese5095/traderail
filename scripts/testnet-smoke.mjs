// V2 public testnet flow; explicit --execute is still required.
if (!process.argv.includes('--testnet')) process.argv.push('--testnet');
await import('./guided-smoke.mjs');
