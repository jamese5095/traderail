// Standard PUBLIC Anvil development accounts. Never use these on a public network.
import { mnemonicToAccount } from 'viem/accounts';
import { toHex } from 'viem';
export const deployerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const warehouseKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
export const supplierKey = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
export const warehouseAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const supplierAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const buyer = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 3 });
export const buyerAddress = buyer.address;
export const buyerKey = toHex(buyer.getHdKey().privateKey);
