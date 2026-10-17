// Select an existing deployment. Does not start services or submit transactions.
import { readFileSync, writeFileSync, renameSync, chmodSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { warehouseKey, warehouseAddress, supplierAddress, supplierKey, buyerKey, buyerAddress } from './local-accounts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = process.argv[2];
const temporary = [];
class SelectionError extends Error {}
function fail(message) { throw new SelectionError(message); }
function envLine(key, value) {
  // Next expands dollar expressions even in dotenv values. Do not silently alter a credential.
  if (/[\r\n\0$]/.test(value)) fail('Environment values must be single-line and contain no dollar expressions');
  if (!value.includes("'")) return `${key}='${value}'`;
  if (!value.includes('"') && !value.includes('\\')) return `${key}="${value}"`;
  fail('Environment value cannot be safely serialized; use a URL-safe warehouse token');
}
try {
  if (!['local', 'monadTestnet'].includes(name)) fail('Usage: node --env-file-if-exists=.env scripts/select-network.mjs [local|monadTestnet]');
  const networks = JSON.parse(readFileSync(resolve(root, 'backend/config/networks.json'), 'utf8'));
  const network = networks[name];
  let deployment;
  try { deployment = JSON.parse(readFileSync(resolve(root, `deployments/${name}.json`), 'utf8')); }
  catch { fail('No readable deployment metadata for this network. Deploy it before selecting it.'); }
  if (deployment.network !== name || deployment.chainId !== network.id) fail('Deployment metadata does not match the selected network');
  for (const field of ['protocol', 'usdc', 'warehouse', 'supplier', ...(deployment.protocolVersion === 2 ? ['buyer'] : [])]) {
    if (!isAddress(deployment[field] ?? '') || /^0x0{40}$/i.test(deployment[field])) fail('Deployment metadata contains an invalid public address');
  }
  if (!/^\d+$/.test(String(deployment.deploymentBlock))) fail('Deployment metadata has no valid deployment block');
  if (!/^0x[0-9a-fA-F]{64}$/.test(deployment.deploymentBlockHash ?? '')) fail('Deployment metadata has no block hash anchor. Regenerate verified metadata before selecting it.');
  const local = name === 'local';
  let env;
  if (local) {
    if (deployment.warehouse.toLowerCase() !== warehouseAddress.toLowerCase() || deployment.supplier.toLowerCase() !== supplierAddress.toLowerCase()) fail('Local deployment roles do not match the standard local demo accounts');
    env = {
      NEXT_PUBLIC_NETWORK: name,
      NEXT_PUBLIC_RPC_URL: process.env.LOCAL_RPC_URL || network.rpcUrl,
      RPC_URL: process.env.LOCAL_RPC_URL || network.rpcUrl,
      WAREHOUSE_PRIVATE_KEY: warehouseKey,
      SUPPLIER_PRIVATE_KEY: supplierKey, BUYER_PRIVATE_KEY: buyerKey,
      GUIDED_DEMO_ENABLED: deployment.protocolVersion === 2 && deployment.buyer.toLowerCase() === buyerAddress.toLowerCase() ? 'true' : 'false',
      WAREHOUSE_API_TOKEN: '',
      DEMO_SIGNER_ENABLED: 'true',
      DEMO_SESSION_DIR: resolve(process.env.DEMO_CHAIN_DIR || resolve(root, '.demo-chain'), 'active/records'),
    };
  } else {
    const key = process.env.WAREHOUSE_PRIVATE_KEY;
    const token = process.env.WAREHOUSE_API_TOKEN;
    if (!key?.trim() || !token?.trim()) fail('Load WAREHOUSE_PRIVATE_KEY and WAREHOUSE_API_TOKEN from the root .env before selecting testnet');
    let matches = false;
    try { matches = privateKeyToAccount(key).address.toLowerCase() === deployment.warehouse.toLowerCase(); } catch { /* Do not expose key parser errors. */ }
    if (!matches) fail('Configured warehouse key does not match the selected deployment');
    if (key.toLowerCase() === warehouseKey.toLowerCase()) fail('Public Anvil credentials cannot be selected for testnet');
    let guided = deployment.protocolVersion === 2 && deployment.demoOnly === true && process.env.GUIDED_DEMO_ENABLED === 'true';
    if (guided) {
      for (const role of ['supplier', 'buyer']) {
        try { if (privateKeyToAccount(process.env[role.toUpperCase() + '_PRIVATE_KEY']).address.toLowerCase() !== deployment[role].toLowerCase()) fail('Guided test signer does not match deployment'); } catch { fail('Configure matching isolated supplier/buyer test keys for guided mode'); }
      }
    }
    const rpc = process.env.RPC_URL || network.rpcUrl;
    let validRpc = false;
    try { validRpc = ['https:', 'http:'].includes(new URL(rpc).protocol); } catch { /* URL may contain credentials; do not print it. */ }
    if (!validRpc) fail('Invalid configured RPC URL');
    env = {
      NEXT_PUBLIC_NETWORK: name,
      NEXT_PUBLIC_RPC_URL: rpc,
      RPC_URL: rpc,
      WAREHOUSE_PRIVATE_KEY: key,
      GUIDED_DEMO_ENABLED: guided ? 'true' : 'false',
      ...(guided ? { SUPPLIER_PRIVATE_KEY: process.env.SUPPLIER_PRIVATE_KEY, BUYER_PRIVATE_KEY: process.env.BUYER_PRIVATE_KEY } : {}),
      WAREHOUSE_API_TOKEN: token,
      DEMO_SIGNER_ENABLED: 'false',
      DEMO_SESSION_DIR: resolve(root, 'frontend/.demo-sessions'),
    };
  }
  const envText = Object.entries(env).map(([key, value]) => envLine(key, value)).join('\n') + '\n';
  const deploymentPath = resolve(root, 'frontend/lib/deployment.json');
  const envPath = resolve(root, 'frontend/.env.local');
  // Validate everything before writing. Private settings are staged with restrictive permissions.
  const deploymentTemporary = `${deploymentPath}.${process.pid}.tmp`;
  const envTemporary = `${envPath}.${process.pid}.tmp`;
  temporary.push(deploymentTemporary, envTemporary);
  writeFileSync(deploymentTemporary, JSON.stringify(deployment, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  writeFileSync(envTemporary, envText, { flag: 'wx', mode: 0o600 });
  chmodSync(envTemporary, 0o600);
  renameSync(envTemporary, envPath);
  renameSync(deploymentTemporary, deploymentPath);
  console.log(`Selected ${name} (chain ${network.id}). Root .env is unchanged. No service started and no transaction submitted.`);
  console.log('Restart/rebuild the web app and run preflight before presenting. The selected chain must already be running/reachable.');
} catch (error) {
  // Never print filesystem/parser/RPC errors that could contain credential material.
  const safe = error instanceof SelectionError ? error.message : 'Could not select network. Check metadata and file permissions; no service was started.';
  console.error(safe);
  process.exitCode = 1;
} finally {
  for (const path of temporary) { try { rmSync(path, { force: true }); } catch { /* Cleanup must not expose credentials. */ } }
}
