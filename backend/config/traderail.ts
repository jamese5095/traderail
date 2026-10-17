import { defineChain } from 'viem';
import metadata from '../../frontend/lib/traderail-deployment.json';
export const railDeployment = metadata;
export const railLocal = metadata.network === 'local';
export const railChain = defineChain({id:metadata.chainId,name:railLocal?'Local EVM · TradeRail V3':'Monad Testnet',nativeCurrency:{name:railLocal?'ETH':'MON',symbol:railLocal?'ETH':'MON',decimals:18},rpcUrls:{default:{http:[metadata.rpcUrl]}},testnet:true});
export const railExplorer = railLocal ? '' : 'https://testnet.monadscan.com';
