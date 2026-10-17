// Creates isolated testnet credentials locally. Existing roles are never replaced.
import { existsSync, writeFileSync, readFileSync, chmodSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const envFile = new URL('../.env', import.meta.url);
try {
  const existed = existsSync(envFile);
  let content = existed ? readFileSync(envFile, 'utf8') : '# Isolated TradeRail TESTNET accounts. Keep credentials on this machine.\n';
  const env = parseEnv(content);
  const added = [];
  const append = (key, value) => { content += `${content.endsWith('\n') ? '' : '\n'}${key}=${value}\n`; env[key] = value; added.push(key); };
  const addresses = { network: 'monadTestnet', chainId: 10143 };
  for (const role of ['deployer', 'warehouse', 'supplier', 'buyer']) {
    const name = role.toUpperCase();
    const keyField = `${name}_PRIVATE_KEY`, addressField = `${name}_ADDRESS`;
    if (!env[keyField]) {
      if (env[addressField]) throw new Error('An existing public role has no local key; do not replace its identity');
      append(keyField, generatePrivateKey());
    }
    const account = privateKeyToAccount(env[keyField]);
    if (env[addressField] && env[addressField].toLowerCase() !== account.address.toLowerCase()) throw new Error('Existing role and signing key mismatch');
    if (!env[addressField]) append(addressField, account.address);
    addresses[role] = account.address;
  }
  if (!env.WAREHOUSE_API_TOKEN) append('WAREHOUSE_API_TOKEN', randomBytes(32).toString('hex'));
  if (!env.RPC_URL) append('RPC_URL', 'https://testnet-rpc.monad.xyz');
  if (!env.GUIDED_DEMO_ENABLED) append('GUIDED_DEMO_ENABLED', 'true');
  if (added.length) {
    const temporary = new URL('../.env.setup.tmp', import.meta.url);
    writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    chmodSync(temporary, 0o600); renameSync(temporary, envFile);
  }
  chmodSync(envFile, 0o600);
  writeFileSync(new URL('../deployments/testnet-accounts.json', import.meta.url), JSON.stringify(addresses, null, 2) + '\n');
  console.log(JSON.stringify({ existingRolesPreserved: existed, addedFields: added, ...addresses }, null, 2));
} catch {
  console.error('Account setup stopped. Check existing role/key configuration; no credentials were printed. Existing roles are not replaced.');
  process.exitCode = 1;
}
