import { defineChain } from 'viem';
import networks from './networks.json';
import deployment from '../../frontend/lib/deployment.json';

const selected = process.env.NEXT_PUBLIC_NETWORK ?? deployment.network;
if (selected !== 'local' && selected !== 'monadTestnet') throw new Error('Unsupported network');
const network = networks[selected];
if (deployment.network !== selected || deployment.chainId !== network.id) throw new Error('Deployment/network mismatch. Deploy to the selected network and rebuild.');
export const isLocal = selected === 'local';
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? network.rpcUrl;
export const explorerUrl = network.explorerUrl;
export const chain = defineChain({ id: network.id, name: network.name, nativeCurrency: { name: network.currency, symbol: network.currency, decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }, ...(explorerUrl ? { blockExplorers: { default: { name: 'Monadscan', url: explorerUrl } } } : {}), testnet: true });
export { deployment };
