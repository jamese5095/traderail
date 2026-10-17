// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../MockUSDC.sol";
import "../SupplyChainFinance.sol";

interface VmTest {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract SupplyChainFinanceTest {
    VmTest constant vm = VmTest(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockUSDC token;
    SupplyChainFinance protocol;
    address constant warehouse = address(0xA11);
    address constant supplier = address(0xB22);
    address constant buyer = address(0xC33);
    bytes32 constant ID = keccak256("SHIP-001");
    bytes32 constant E1 = keccak256("receive-1");
    uint256 constant UNIT = 1e6;

    function setUp() public {
        token = new MockUSDC();
        protocol = new SupplyChainFinance(address(token), warehouse);
        protocol.registerOrder(ID, supplier, buyer, 100_000 * UNIT);
        token.mint(address(protocol), 1_000_000 * UNIT);
    }
    function _receive() internal { vm.prank(warehouse); protocol.recordGoodsReceived(ID, E1, 100_000 * UNIT, 100); }
    function _borrow(uint256 amount) internal { vm.prank(supplier); protocol.borrow(ID, amount); }
    function _outbound() internal { vm.prank(warehouse); protocol.recordGoodsOutbound(ID, keccak256("exit-1")); }
    function _repay(uint256 amount) internal {
        vm.prank(supplier); token.approve(address(protocol), amount);
        vm.prank(supplier); protocol.repay(ID, amount);
    }
    function _deliver() internal { vm.prank(buyer); protocol.recordDelivery(ID, keccak256("delivery-1")); }

    function testGoodsReceivedCreatesCredit() public {
        _receive();
        SupplyChainFinance.InventoryPosition memory p = protocol.getPosition(ID);
        require(p.verifiedInventoryValue == 100_000 * UNIT, "Inventory");
        require(p.borrowingPower == 80_000 * UNIT, "LTV");
        require(p.status == SupplyChainFinance.PositionStatus.RECEIVED, "Status");
    }
    function testBorrowTransfersStablecoinAndUpdatesCredit() public {
        _receive(); _borrow(50_000 * UNIT);
        require(protocol.getPosition(ID).outstandingDebt == 50_000 * UNIT, "Debt");
        require(protocol.availableCredit(ID) == 30_000 * UNIT, "Credit");
        require(token.balanceOf(supplier) == 50_000 * UNIT, "Supplier money");
        require(token.balanceOf(address(protocol)) == 950_000 * UNIT, "Pool money");
    }
    function testCannotBorrowAboveCredit() public {
        _receive();
        vm.expectRevert(SupplyChainFinance.CreditExceeded.selector); _borrow(80_001 * UNIT);
    }
    function testOutboundFreezesCreditAndPreservesDebt() public {
        _receive(); _borrow(50_000 * UNIT); _outbound();
        require(protocol.getPosition(ID).borrowingPower == 0, "Frozen");
        require(protocol.getPosition(ID).outstandingDebt == 50_000 * UNIT, "Debt persists");
        require(protocol.availableCredit(ID) == 0, "No underflow");
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); _borrow(1);
    }
    function testWarehouseAuthorization() public {
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector);
        protocol.recordGoodsReceived(ID, E1, 100_000 * UNIT, 100);
        _receive();
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); protocol.recordGoodsOutbound(ID, E1);
        _outbound();
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); protocol.recordDelivery(ID, E1);
    }
    function testSupplierAuthorization() public {
        _receive(); vm.expectRevert(SupplyChainFinance.Unauthorized.selector); protocol.borrow(ID, UNIT);
    }
    function testDeliveryConvertsAssetButDoesNotForgiveDebt() public {
        _receive(); _borrow(50_000 * UNIT); _outbound();
        vm.prank(buyer); protocol.recordDelivery(ID, keccak256("delivery-1"));
        SupplyChainFinance.InventoryPosition memory p = protocol.getPosition(ID);
        require(p.status == SupplyChainFinance.PositionStatus.DELIVERED, "Delivered");
        require(p.borrowingPower == 0 && p.outstandingDebt == 50_000 * UNIT, "No new credit");
    }
    function testEventReplayRejectedAcrossShipments() public {
        _receive(); bytes32 second = keccak256("SHIP-002"); protocol.registerShipment(second, supplier);
        vm.expectRevert(SupplyChainFinance.EventAlreadyProcessed.selector);
        vm.prank(warehouse); protocol.recordGoodsReceived(second, E1, UNIT, 1);
    }
    function testInvalidTransitionsAndZeroBorrow() public {
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); _borrow(UNIT);
        vm.expectRevert(SupplyChainFinance.InvalidState.selector);
        vm.prank(buyer); protocol.recordDelivery(ID, E1);
        _receive(); vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); _borrow(0);
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); _receive();
    }
    function testInsufficientPoolRollsBackDebt() public {
        MockUSDC empty = new MockUSDC();
        SupplyChainFinance unfunded = new SupplyChainFinance(address(empty), warehouse);
        unfunded.registerShipment(ID, supplier);
        vm.prank(warehouse); unfunded.recordGoodsReceived(ID, E1, 100_000 * UNIT, 100);
        vm.expectRevert(bytes("Insufficient balance")); vm.prank(supplier); unfunded.borrow(ID, UNIT);
        require(unfunded.getPosition(ID).outstandingDebt == 0, "Atomic rollback");
    }
    function testRegistrationAuthorizationAndDuplicate() public {
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector);
        vm.prank(supplier); protocol.registerShipment(keccak256("new"), supplier);
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); protocol.registerOrder(ID, supplier, buyer, 100_000 * UNIT);
    }
    function testFuzzBorrowWithinLimit(uint64 rawAmount) public {
        _receive(); uint256 amount = uint256(rawAmount) % (80_000 * UNIT) + 1;
        _borrow(amount);
        require(protocol.availableCredit(ID) + protocol.getPosition(ID).outstandingDebt == 80_000 * UNIT, "Conservation");
        require(token.balanceOf(supplier) == amount, "Exact transfer");
    }
    function testMockUSDCFaucetAndPoolFunding() public {
        vm.prank(supplier); token.faucet();
        require(token.decimals() == 6 && token.balanceOf(supplier) == 10_000 * UNIT, "Faucet");
        vm.prank(supplier); token.approve(address(protocol), 10_000 * UNIT);
        vm.prank(supplier); protocol.fundPool(10_000 * UNIT);
        require(token.balanceOf(supplier) == 0, "Funded");
    }

    function testPartialRepaymentRestoresOnlyEligibleCredit() public {
        _receive(); _borrow(50_000 * UNIT); _repay(20_000 * UNIT);
        require(protocol.getPosition(ID).outstandingDebt == 30_000 * UNIT, "Principal reduced");
        require(protocol.availableCredit(ID) == 50_000 * UNIT, "Eligible credit restored");
        require(token.balanceOf(supplier) == 30_000 * UNIT, "Supplier paid exact principal");
        require(token.balanceOf(address(protocol)) == 970_000 * UNIT, "Pool received principal");
    }

    function testRepaymentAfterOutboundKeepsCreditFrozen() public {
        _receive(); _borrow(50_000 * UNIT); _outbound(); _repay(50_000 * UNIT);
        require(protocol.availableCredit(ID) == 0, "Credit remains frozen");
        require(protocol.getPosition(ID).borrowingPower == 0, "No revived collateral");
        require(protocol.getPosition(ID).status == SupplyChainFinance.PositionStatus.OUTBOUND, "Delivery still required");
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); _borrow(UNIT);
        _deliver();
        require(protocol.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED, "Buyer has not paid");
    }

    function testDeliveredLoanClosesOnlyAfterFullRepayment() public {
        _receive(); _borrow(50_000 * UNIT); _outbound(); _deliver();
        _repay(10_000 * UNIT);
        require(protocol.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED, "Partial repayment not closed");
        _repay(40_000 * UNIT);
        require(protocol.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED, "Buyer has not paid");
        require(protocol.getPosition(ID).outstandingDebt == 0 && protocol.availableCredit(ID) == 0, "No debt or eligibility");
        require(token.balanceOf(address(protocol)) == 1_000_000 * UNIT, "Principal returned to pool");
        require(token.balanceOf(supplier) == 0, "Exact principal returned");
    }

    function testDeliveryWithoutBorrowClosesWithoutInventedDebt() public {
        _receive(); _outbound(); _deliver();
        require(protocol.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED, "No-debt delivery still awaits payment");
        require(protocol.getPosition(ID).outstandingDebt == 0, "Never borrowed");
    }

    function testInvalidAndUnauthorizedRepayment() public {
        _receive(); _borrow(50_000 * UNIT);
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); protocol.repay(ID, UNIT);
        vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); vm.prank(supplier); protocol.repay(ID, 0);
        vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); vm.prank(supplier); protocol.repay(ID, 50_001 * UNIT);
        require(protocol.getPosition(ID).outstandingDebt == 50_000 * UNIT, "Invalid repayments leave debt unchanged");
    }

    function testRepaymentTransferFailureRollsBackDebtAndClosure() public {
        _receive(); _borrow(50_000 * UNIT); _outbound(); _deliver();
        vm.expectRevert(bytes("Insufficient allowance")); vm.prank(supplier); protocol.repay(ID, 50_000 * UNIT);
        require(protocol.getPosition(ID).outstandingDebt == 50_000 * UNIT, "Allowance failure rolls back debt");
        require(protocol.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED, "Not closed on failure");
        vm.prank(supplier); token.transfer(address(0x123), 50_000 * UNIT);
        vm.prank(supplier); token.approve(address(protocol), 50_000 * UNIT);
        vm.expectRevert(bytes("Insufficient balance")); vm.prank(supplier); protocol.repay(ID, 50_000 * UNIT);
        require(protocol.getPosition(ID).outstandingDebt == 50_000 * UNIT, "Balance failure rolls back debt");
    }

    function testRepaymentCannotEraseAnotherShipmentsDebt() public {
        _receive(); _borrow(50_000 * UNIT);
        bytes32 second = keccak256("SHIP-002"); protocol.registerShipment(second, supplier);
        vm.prank(warehouse); protocol.recordGoodsReceived(second, keccak256("receive-2"), 100_000 * UNIT, 100);
        vm.prank(supplier); protocol.borrow(second, 20_000 * UNIT);
        _repay(50_000 * UNIT);
        require(protocol.getPosition(ID).outstandingDebt == 0, "First principal returned");
        require(protocol.getPosition(second).outstandingDebt == 20_000 * UNIT, "Second debt preserved");
    }

    function testFuzzRepaymentConservesPrincipal(uint64 rawBorrow, uint64 rawRepay) public {
        _receive();
        uint256 borrowed = uint256(rawBorrow) % (80_000 * UNIT) + 1;
        uint256 returned = uint256(rawRepay) % borrowed + 1;
        _borrow(borrowed); _repay(returned);
        uint256 debt = protocol.getPosition(ID).outstandingDebt;
        require(debt == borrowed - returned, "Principal conservation");
        require(token.balanceOf(supplier) == debt, "Money matches debt");
        require(token.balanceOf(address(protocol)) + debt == 1_000_000 * UNIT, "Pool conservation");
        require(protocol.availableCredit(ID) + debt == 80_000 * UNIT, "Eligible capacity conservation");
    }
}
