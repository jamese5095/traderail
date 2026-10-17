// Fund only the configured testnet roles. Repeat runs top up to 1 test MON.
import { createPublicClient, createWalletClient, http, parseEther, formatEther, defineChain, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const rpc = process.env.RPC_URL || 'https://testnet-rpc.monad.xyz';
const chain = defineChain({ id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpc] } }, testnet: true });
try {
  // Validate every role before sending anything: missing configuration is not success.
  const roles = [['warehouse', process.env.WAREHOUSE_ADDRESS], ['supplier', process.env.SUPPLIER_ADDRESS], ['buyer', process.env.BUYER_ADDRESS]];
  if (!process.env.DEPLOYER_PRIVATE_KEY?.trim()) throw new Error('Missing deployer key');
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
  if (!roles.every(([, address]) => isAddress(address ?? '') && !/^0x0{40}$/i.test(address))) throw new Error('Invalid role addresses');
  const publicClient = createPublicClient({ chain, transport: http(rpc, { timeout: 20000, retryCount: 1 }) });
  if (await publicClient.getChainId() !== 10143) throw new Error('Expected Monad Testnet chain 10143');
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  for (const [role, address] of roles) {
    const balance = await publicClient.getBalance({ address });
    const target = parseEther('1');
    if (balance >= target) { console.log(`${role}: ${formatEther(balance)} test MON; no top-up needed`); continue; }
    if (address.toLowerCase() === account.address.toLowerCase()) throw new Error('Deployer role balance is below the target and cannot self-fund');
    const value = target - balance;
    const hash = await wallet.sendTransaction({ to: address, value });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Gas funding transaction reverted');
    console.log(JSON.stringify({ role, address, addedTestMON: formatEther(value), hash, block: String(receipt.blockNumber) }));
  }
} catch {
  console.error('Testnet funding did not complete. Check chain, configured addresses, signer and test MON balance. No credentials printed.');
  process.exitCode = 1;
}
