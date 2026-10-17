import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployerKey, warehouseAddress, supplierAddress, buyerAddress, buyerKey } from './local-accounts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const networks = JSON.parse(readFileSync(new URL('../backend/config/networks.json', import.meta.url)));
const name = process.argv[2] ?? 'local';
if (!networks[name]) throw new Error('Use local or monadTestnet');
const net = networks[name];
const local = name === 'local';
const key = local ? deployerKey : process.env.DEPLOYER_PRIVATE_KEY;
const warehouse = local ? warehouseAddress : process.env.WAREHOUSE_ADDRESS;
const supplier = local ? supplierAddress : process.env.SUPPLIER_ADDRESS;
const buyer = local ? buyerAddress : process.env.BUYER_ADDRESS;
const buyerSignerKey = local ? buyerKey : process.env.BUYER_PRIVATE_KEY;
if (!key || !warehouse || !supplier) throw new Error('Set DEPLOYER_PRIVATE_KEY, WAREHOUSE_ADDRESS and SUPPLIER_ADDRESS in .env');
if (!buyerSignerKey || !isAddress(buyer ?? '') || !isAddress(warehouse) || !isAddress(supplier)) throw new Error('Warehouse and supplier must be valid public addresses');
if (!local) {
  if (!process.env.WAREHOUSE_API_TOKEN?.trim()) throw new Error('Set WAREHOUSE_API_TOKEN before testnet deployment');
  if (!process.env.WAREHOUSE_PRIVATE_KEY?.trim()) throw new Error('Set WAREHOUSE_PRIVATE_KEY before testnet deployment');
  let warehouseMatches = false;
  try { warehouseMatches = privateKeyToAccount(process.env.WAREHOUSE_PRIVATE_KEY).address.toLowerCase() === warehouse.toLowerCase(); } catch { /* Never include key parser output. */ }
  if (!warehouseMatches) throw new Error('Warehouse signing key must match WAREHOUSE_ADDRESS');
  try { privateKeyToAccount(key); } catch { throw new Error('Invalid deployer signing key'); }
}
try {
  if (privateKeyToAccount(buyerSignerKey).address.toLowerCase() !== buyer.toLowerCase()) throw new Error();
  if (!local && process.env.GUIDED_DEMO_ENABLED === 'true' && privateKeyToAccount(process.env.SUPPLIER_PRIVATE_KEY).address.toLowerCase() !== supplier.toLowerCase()) throw new Error();
} catch { throw new Error('Buyer or guided supplier key does not match the configured role'); }
const rpc = local ? (process.env.LOCAL_RPC_URL || net.rpcUrl) : (process.env.RPC_URL || net.rpcUrl);
const chainResponse = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
const chain = await chainResponse.json();
if (Number(BigInt(chain.result)) !== net.id) throw new Error('RPC chain ID does not match configured network');
// Archive public metadata before replacing the selected deployment; onchain history remains intact.
const archive = root + 'deployments/archive';
mkdirSync(archive, { recursive: true });
const oldPath = root + `deployments/${name}.json`;
if (existsSync(oldPath)) {
  const old = JSON.parse(readFileSync(oldPath));
  copyFileSync(oldPath, `${archive}/${name}-v${old.protocolVersion ?? 1}-${old.protocol}.json`);
  if (name === 'monadTestnet' && existsSync(root + 'deployments/testnet-rehearsal.json')) copyFileSync(root + 'deployments/testnet-rehearsal.json', `${archive}/rehearsal-${old.protocol}.json`);
}
const deployed = spawnSync('forge', ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', rpc, '--broadcast', '--slow', '--non-interactive'], {
  cwd: root + 'contracts', stdio: 'inherit', env: { ...process.env, TRADERAIL_DEPLOYER_KEY: key, TRADERAIL_BUYER_KEY: buyerSignerKey, WAREHOUSE_ADDRESS: warehouse, SUPPLIER_ADDRESS: supplier, BUYER_ADDRESS: buyer }
});
if (deployed.status !== 0) process.exit(deployed.status ?? 1);
const broadcast = JSON.parse(readFileSync(root + `contracts/broadcast/Deploy.s.sol/${net.id}/run-latest.json`));
const find = n => broadcast.transactions.find(t => t.transactionType === 'CREATE' && t.contractName === n)?.contractAddress;
const protocol = find('SupplyChainFinance');
const usdc = find('MockUSDC');
if (!protocol || !usdc) throw new Error('Missing deployment addresses');
const firstBlock = Math.min(...broadcast.receipts.map(r => Number(BigInt(r.blockNumber))));
const anchorResponse = await fetch(rpc, { method: 'POST', signal: AbortSignal.timeout(15_000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: ['0x' + firstBlock.toString(16), false] }) });
const anchor = await anchorResponse.json();
const deploymentBlockHash = anchor.result?.hash;
if (!/^0x[0-9a-fA-F]{64}$/.test(deploymentBlockHash ?? '')) throw new Error('Unable to read deployment block anchor');
const deployment = { protocolVersion: 2, demoOnly: true, orderAmount: '100000000000', buyer, deploymentBlockHash, network: name, chainId: net.id, protocol, usdc, supplier, warehouse, deploymentBlock: String(firstBlock), demoShipments: Array.from({ length: 20 }, (_, i) => `SHIP-${String(i + 1).padStart(3, '0')}`) };
writeFileSync(root + `deployments/${name}.json`, JSON.stringify(deployment, null, 2) + '\n');
writeFileSync(root + 'frontend/lib/deployment.json', JSON.stringify(deployment, null, 2) + '\n');
for (const [contract, file] of [['SupplyChainFinance', 'protocol-abi.json'], ['MockUSDC', 'usdc-abi.json']]) {
  const artifact = JSON.parse(readFileSync(root + `contracts/out/${contract}.sol/${contract}.json`));
  writeFileSync(root + 'frontend/lib/' + file, JSON.stringify(artifact.abi, null, 2) + '\n');
}
const selection = spawnSync(process.execPath, ['scripts/select-network.mjs', name], {
  cwd: root, stdio: 'inherit', env: { ...process.env, ...(local ? {} : { RPC_URL: rpc }) }
});
if (selection.status !== 0) {
  console.error('Contracts were deployed, but network selection failed. Fix configuration and run select-network; do not redeploy merely to retry selection.');
  process.exit(selection.status ?? 1);
}

console.log(`Deployed ${name}: protocol ${protocol}, mock USDC ${usdc}`);
