#!/usr/bin/env node
// Standard JSON compiler bridge: Foundry still executes all tests and deployments.
// Keeps npm install reproducible without a separate native solc download.
const solc = require('solc');
if (process.argv.includes('--version')) {
  process.stdout.write('solc, the solidity compiler commandline interface\nVersion: ' + solc.version() + '\n');
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => process.stdout.write(solc.compile(input)));
}
