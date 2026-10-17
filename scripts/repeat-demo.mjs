// V2 three-round replay; retained entry point.
if (!process.argv.some(a => a.startsWith('--rounds='))) process.argv.push('--rounds=3');
await import('./guided-smoke.mjs');
