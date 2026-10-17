import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { warehouseKey, supplierKey, buyerKey } from './local-accounts.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const net = JSON.parse(readFileSync(join(root, 'backend/config/networks.json'))).local;
const storage = resolve(process.env.DEMO_CHAIN_DIR ?? join(root, '.demo-chain'));
const active = join(storage, 'active');
const stateFile = join(active, 'state.json');
const manifestFile = join(active, 'session.json');
const savedDeployment = join(active, 'deployment.json');
const records = join(active, 'records');
const fresh = process.argv.includes('--fresh');
const fingerprint = createHash('sha256').update(readFileSync(join(root, 'contracts/SupplyChainFinance.sol'))).update(readFileSync(join(root, 'contracts/MockUSDC.sol'))).digest('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
let anvil, next, stopping = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rpc(method = 'eth_chainId', params = []) {
  const response = await fetch(net.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(3000) });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  if (result.result === undefined) throw new Error('RPC did not return a result');
  return result.result;
}
async function isRunning() { try { await rpc(); return true; } catch { return false; } }
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  // Large block/receipt histories can take longer to flush than the application server.
  await Promise.race([exited, delay(child === anvil ? 120_000 : 8000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await stopChild(next);
  await stopChild(anvil); // Anvil flushes the final chain snapshot on graceful exit.
  if (existsSync(stateFile) && existsSync(manifestFile)) console.log('Demo session saved. npm run demo resumes this chain and its history.');
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  if (await isRunning()) throw new Error('Port 8545 is in use. Stop the existing local demo before starting or resuming this session.');
  if (fresh && existsSync(active)) {
    const archive = join(storage, 'archives');
    mkdirSync(archive, { recursive: true });
    const destination = join(archive, new Date().toISOString().replace(/[:.]/g, '-'));
    renameSync(active, destination);
    console.log(`Previous local session archived: ${destination}`);
  }
  const resume = existsSync(manifestFile);
  if (!resume && existsSync(stateFile)) throw new Error('Chain snapshot has no session manifest. Use npm run demo:fresh to archive it and start a separate session.');
  let manifest;
  if (resume) {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (!existsSync(stateFile) || !existsSync(savedDeployment)) throw new Error('Incomplete saved session. Use npm run demo:fresh to archive it before creating a new chain.');
    if (manifest.contractFingerprint !== fingerprint) throw new Error('Contract source changed since this session was deployed. Use npm run demo:fresh; the old session will be archived.');
  }
  mkdirSync(records, { recursive: true });
  anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(new URL(net.rpcUrl).port), '--chain-id', String(net.id), '--silent', '--state', stateFile, '--state-interval', '30'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  anvil.on('error', error => { console.error('Anvil could not start:', error.message); void stop(1); });
  anvil.on('exit', code => { if (!stopping) { console.error('Anvil stopped:', code); void stop(1); } });
  // Persist current state plus blocks/transactions/receipts. Historical contract reads
  // use saved evidence snapshots when Anvil no longer retains the old storage state.
  // Do not preserve historical states: their repeated block-hash maps grow quadratically.
  let ready = false;
  const startupDeadline = Date.now() + 120_000;
  let nextProgress = Date.now() + 15_000;
  while (Date.now() < startupDeadline) {
    if (await isRunning()) { ready = true; break; }
    if (anvil.exitCode !== null || anvil.signalCode !== null) break;
    if (Date.now() >= nextProgress) { console.log('Anvil is still loading the saved chain history…'); nextProgress = Date.now() + 15_000; }
    await delay(250);
  }
  if (!ready) throw new Error('Anvil did not become ready within 120 seconds. The saved session has been retained.');
  if (Number(BigInt(await rpc())) !== net.id) throw new Error('Unexpected local chain ID');
  if (resume) {
    const deployed = JSON.parse(readFileSync(savedDeployment, 'utf8'));
    const code = await rpc('eth_getCode', [deployed.protocol, 'latest']);
    const tokenCode = await rpc('eth_getCode', [deployed.usdc, 'latest']);
    const anchor = await rpc('eth_getBlockByNumber', ['0x' + BigInt(deployed.deploymentBlock).toString(16), false]);
    if (code === '0x' || digest(code) !== manifest.protocolCodeHash || digest(tokenCode) !== manifest.tokenCodeHash || anchor?.hash !== manifest.deploymentBlockHash) throw new Error('Saved chain and deployment identity do not match. Use npm run demo:fresh to archive the inconsistent session.');
    copyFileSync(savedDeployment, join(root, 'deployments/local.json'));
    copyFileSync(savedDeployment, join(root, 'frontend/lib/deployment.json'));
    for (const name of ['protocol-abi.json', 'usdc-abi.json']) copyFileSync(join(active, name), join(root, 'frontend/lib', name));
    console.log('Resumed the saved local chain, contract deployment and demo rounds.');
  } else {
    const deploy = spawnSync(process.execPath, ['scripts/deploy.mjs', 'local'], { cwd: root, stdio: 'inherit', env: { ...process.env, RPC_URL: net.rpcUrl } });
    if (deploy.status !== 0) throw new Error('Local contract deployment failed');
    const deployed = JSON.parse(readFileSync(join(root, 'deployments/local.json'), 'utf8'));
    const anchor = await rpc('eth_getBlockByNumber', ['0x' + BigInt(deployed.deploymentBlock).toString(16), false]);
    manifest = { version: 1, createdAt: new Date().toISOString(), chainId: net.id, contractFingerprint: fingerprint, protocolCodeHash: digest(await rpc('eth_getCode', [deployed.protocol, 'latest'])), tokenCodeHash: digest(await rpc('eth_getCode', [deployed.usdc, 'latest'])), deploymentBlockHash: anchor.hash };
    copyFileSync(join(root, 'deployments/local.json'), savedDeployment);
    for (const name of ['protocol-abi.json', 'usdc-abi.json']) copyFileSync(join(root, 'frontend/lib', name), join(active, name));
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    console.log('Created a new persistent local demo session.');
  }
  const port = process.env.PORT ?? '3000';
  next = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', port], { cwd: join(root, 'frontend'), stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_NETWORK: 'local', NEXT_PUBLIC_RPC_URL: net.rpcUrl, RPC_URL: net.rpcUrl, WAREHOUSE_PRIVATE_KEY: warehouseKey, SUPPLIER_PRIVATE_KEY: supplierKey, BUYER_PRIVATE_KEY: buyerKey, GUIDED_DEMO_ENABLED: 'true', WAREHOUSE_API_TOKEN: '', DEMO_SESSION_DIR: records, DEMO_SIGNER_ENABLED: 'true', NEXT_TELEMETRY_DISABLED: '1' } });
  next.on('error', error => { console.error(error.message); void stop(1); });
  next.on('exit', code => { if (!stopping) void stop(code ?? 1); });
  console.log(`\nDashboard: http://localhost:${port}\nWarehouse: http://localhost:${port}/erp\nEvidence: http://localhost:${port}/verification\nCtrl+C saves this session. npm run demo resumes; npm run demo:fresh archives it and starts a new chain.\n`);
} catch (error) {
  console.error(error.message);
  await stop(1);
}
