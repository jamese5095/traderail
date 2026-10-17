// Read-only rehearsal checks. Never submits transactions or prints credentials/RPC URLs.
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createPublicClient, http, formatUnits, isAddress, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const frontendEnv = new URL('../frontend/.env.local', import.meta.url);
const env = { ...(existsSync(frontendEnv) ? parseEnv(readFileSync(frontendEnv, 'utf8')) : {}), ...process.env };
const frontend = readJson('../frontend/lib/deployment.json');
const networks = readJson('../backend/config/networks.json');
const networkName = process.argv[2] ?? env.NEXT_PUBLIC_NETWORK ?? frontend.network;
const checks = [];
const record = (label, ok, detail = '') => { checks.push({ label, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`); };
const warning = message => console.log(`NOTE  ${message}`);

async function main() {
  if (!['local', 'monadTestnet'].includes(networkName)) { record('network selection', false, 'Use local or monadTestnet'); return; }
  const network = networks[networkName];
  let deployment;
  try { deployment = readJson(`../deployments/${networkName}.json`); }
  catch { record('deployment metadata', false, 'Deploy this network before preflight'); return; }
  const local = networkName === 'local';
  console.log(`TradeRail preflight · ${network.name} · READ ONLY`);
  record('deployment chain ID', deployment.chainId === network.id && deployment.network === networkName);
  record('frontend deployment matches', frontend.network === networkName && frontend.chainId === network.id && frontend.protocol?.toLowerCase() === deployment.protocol?.toLowerCase() && frontend.usdc?.toLowerCase() === deployment.usdc?.toLowerCase() && frontend.deploymentBlock === deployment.deploymentBlock && frontend.deploymentBlockHash === deployment.deploymentBlockHash);
  record('configured frontend network', !env.NEXT_PUBLIC_NETWORK || env.NEXT_PUBLIC_NETWORK === networkName);
  const addressesOk = ['protocol', 'usdc', 'warehouse', 'supplier', ...(deployment.protocolVersion === 2 ? ['buyer'] : [])].every(key => isAddress(deployment[key] ?? '') && !/^0x0{40}$/i.test(deployment[key]));
  record('public contract and role addresses', addressesOk);
  if (!addressesOk) return;
  const rpc = local ? env.LOCAL_RPC_URL || network.rpcUrl : env.RPC_URL || env.NEXT_PUBLIC_RPC_URL || network.rpcUrl;
  const client = createPublicClient({ transport: http(rpc, { timeout: 10_000, retryCount: 1 }) });
  let chainId;
  try { chainId = await client.getChainId(); }
  catch { record('RPC reachable', false, 'Check connectivity and RPC configuration'); return; }
  record('RPC chain ID', chainId === network.id, `expected ${network.id}, received ${chainId}`);
  if (chainId !== network.id) return;
  const blockNumber = await client.getBlockNumber();
  if (env.NEXT_PUBLIC_RPC_URL && env.NEXT_PUBLIC_RPC_URL !== rpc) {
    try {
      const publicClient = createPublicClient({ transport: http(env.NEXT_PUBLIC_RPC_URL, { timeout: 10_000, retryCount: 1 }) });
      record('browser RPC chain ID', await publicClient.getChainId() === network.id);
      const [serverBlock, browserBlock] = await Promise.all([client.getBlock({ blockNumber: BigInt(deployment.deploymentBlock) }), publicClient.getBlock({ blockNumber: BigInt(deployment.deploymentBlock) })]);
      record('browser and server deployment anchor match', serverBlock.hash === browserBlock.hash);
    } catch { record('browser RPC validation', false, 'Check public RPC configuration'); }
  }
  const [protocolCode, tokenCode] = await Promise.all([client.getCode({ address: deployment.protocol, blockNumber }), client.getCode({ address: deployment.usdc, blockNumber })]);
  record('protocol contract code', Boolean(protocolCode && protocolCode !== '0x'));
  record('MockUSDC contract code', Boolean(tokenCode && tokenCode !== '0x'));
  if (!protocolCode || protocolCode === '0x' || !tokenCode || tokenCode === '0x') return;
  const anchor = await client.getBlock({ blockNumber: BigInt(deployment.deploymentBlock) });
  if (deployment.deploymentBlockHash) record('deployment block anchor', anchor.hash?.toLowerCase() === deployment.deploymentBlockHash.toLowerCase());
  else warning('Legacy deployment has no block hash anchor. A fresh deployment records it; address/code checks alone do not identify a local session.');
  const protocolAbi = readJson('../frontend/lib/protocol-abi.json');
  const tokenAbi = readJson('../frontend/lib/usdc-abi.json');
  const readProtocol = (functionName, args = []) => client.readContract({ address: deployment.protocol, abi: protocolAbi, functionName, args, blockNumber });
  const readToken = (functionName, args = []) => client.readContract({ address: deployment.usdc, abi: tokenAbi, functionName, args, blockNumber });
  const [warehouse, token, decimals, pool, supplierBalance, warehouseGas, supplierGas] = await Promise.all([
    readProtocol('warehouse'), readProtocol('settlementToken'), readToken('decimals'), readToken('balanceOf', [deployment.protocol]), readToken('balanceOf', [deployment.supplier]),
    client.getBalance({ address: deployment.warehouse, blockNumber }), client.getBalance({ address: deployment.supplier, blockNumber }),
  ]);
  record('authorized warehouse matches metadata', warehouse.toLowerCase() === deployment.warehouse.toLowerCase());
  record('settlement token matches metadata', token.toLowerCase() === deployment.usdc.toLowerCase());
  record('MockUSDC precision', Number(decimals) === 6);
  record('pool covers one 50,000 loan', pool >= 50_000n * 10n ** BigInt(decimals), `${formatUnits(pool, Number(decimals))} MockUSDC`);
  console.log(`INFO  supplier cumulative balance: ${formatUnits(supplierBalance, Number(decimals))} MockUSDC`);
  record('warehouse has native gas', warehouseGas > 0n, `${formatUnits(warehouseGas, 18)} ${network.currency}`);
  record('supplier has native gas', supplierGas > 0n, `${formatUnits(supplierGas, 18)} ${network.currency}`);
  warning('Nonzero native balances are a readiness check, not a gas cost guarantee.');
  const shipments = deployment.demoShipments ?? [];
  record('prepared shipment metadata', shipments.length > 0 && shipments.every(id => typeof id === 'string'));
  let fresh = 0;
  for (const shipment of shipments) {
    const position = await readProtocol('getPosition', [keccak256(toBytes(shipment))]);
    record(`registered supplier ${shipment}`, position.supplier.toLowerCase() === deployment.supplier.toLowerCase());
    if (deployment.protocolVersion === 2 && (position.buyer.toLowerCase() !== deployment.buyer.toLowerCase() || position.orderAmount !== 100_000n * 10n ** BigInt(decimals))) { record(`buyer and order terms ${shipment}`, false); }
    if (Number(position.status) === 0 && position.supplier.toLowerCase() === deployment.supplier.toLowerCase()) fresh++;
  }
  record('fresh prepared batch available', fresh > 0, `${fresh} / ${shipments.length} at NONE`);
  if (deployment.protocolVersion === 2) {
    const [buyerGas, buyerBalance, allowance] = await Promise.all([client.getBalance({ address: deployment.buyer, blockNumber }), readToken('balanceOf', [deployment.buyer]), readToken('allowance', [deployment.buyer, deployment.protocol])]);
    record('buyer has native gas', buyerGas > 0n, `${formatUnits(buyerGas, 18)} ${network.currency}`);
    record('buyer covers one order', buyerBalance >= 100_000n * 10n ** BigInt(decimals));
    record('buyer settlement approval prepared', allowance >= 100_000n * 10n ** BigInt(decimals));
    record('explicit test-only guided deployment', deployment.demoOnly === true);
    if (env.GUIDED_DEMO_ENABLED === 'true') {
      for (const role of ['warehouse', 'supplier', 'buyer']) {
        let matches = false;
        try { matches = privateKeyToAccount(env[role.toUpperCase() + '_PRIVATE_KEY']).address.toLowerCase() === deployment[role].toLowerCase(); } catch {}
        record(`guided ${role} signer matches`, matches);
      }
    }
  }
  if (!local) {
    record('warehouse API token configured', Boolean(env.WAREHOUSE_API_TOKEN?.trim()));
    record('warehouse signing key configured', Boolean(env.WAREHOUSE_PRIVATE_KEY?.trim()));
    if (env.WAREHOUSE_PRIVATE_KEY) {
      let matches = false;
      try { matches = privateKeyToAccount(env.WAREHOUSE_PRIVATE_KEY).address.toLowerCase() === deployment.warehouse.toLowerCase(); } catch { /* Never print key parsing errors. */ }
      record('warehouse signer matches authorized role', matches);
    }
    if (env.WAREHOUSE_ADDRESS) record('configured warehouse address matches', env.WAREHOUSE_ADDRESS.toLowerCase() === deployment.warehouse.toLowerCase());
    if (env.SUPPLIER_ADDRESS) record('configured supplier address matches', env.SUPPLIER_ADDRESS.toLowerCase() === deployment.supplier.toLowerCase());
    warning(env.GUIDED_DEMO_ENABLED === 'true' ? 'Guided mode uses isolated test signers on localhost. No visitor wallet is needed.' : 'Advanced financial operations require the registered supplier wallet.');
  }
  console.log(`INFO  verified snapshot block: ${blockNumber}`);
}
try { await main(); }
catch { record('read-only checks completed', false, 'A contract read or metadata check failed. Check deployment/ABI and network connectivity.'); }
const failures = checks.filter(check => !check.ok).length;
console.log(`\n${failures ? 'NOT READY' : 'CHECKS PASSED'} · ${checks.length - failures}/${checks.length} checks passed. No transaction submitted.`);
process.exitCode = failures ? 1 : 0;
