// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../MockUSDC.sol";
import "../SupplyChainFinance.sol";

interface VmDeploy {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}
contract Deploy {
    VmDeploy constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));
    function run() external {
        address warehouse = vm.envAddress("WAREHOUSE_ADDRESS");
        address supplier = vm.envAddress("SUPPLIER_ADDRESS");
        address buyer = vm.envAddress("BUYER_ADDRESS");
        vm.startBroadcast(vm.envUint("TRADERAIL_DEPLOYER_KEY"));
        MockUSDC usdc = new MockUSDC();
        SupplyChainFinance protocol = new SupplyChainFinance(address(usdc), warehouse);
        usdc.mint(address(protocol), 1_000_000 * 1e6);
        usdc.mint(buyer, 20 * 100_000 * 1e6);
        // Reserve 20 onchain demo rounds so testnet replay needs no runtime owner key.
        for (uint256 i = 1; i <= 20; i++) {
            bytes memory id = abi.encodePacked("SHIP-", bytes1(uint8(48 + i / 100)), bytes1(uint8(48 + i / 10 % 10)), bytes1(uint8(48 + i % 10)));
            protocol.registerOrder(keccak256(id), supplier, buyer, 100_000 * 1e6);
        }
        vm.stopBroadcast();
        // One bounded approval for the prepared demo orders; no approval popup per step.
        vm.startBroadcast(vm.envUint("TRADERAIL_BUYER_KEY"));
        usdc.approve(address(protocol), 20 * 100_000 * 1e6);
        vm.stopBroadcast();
    }
}
