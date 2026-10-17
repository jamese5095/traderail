// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../SupplyChainFinance.sol";
import "../MockUSDC.sol";
interface VmOrder { function prank(address) external; function expectRevert(bytes4) external; function expectRevert(bytes calldata) external; }

contract FailingSettlementToken {
    mapping(address => uint256) public balanceOf;
    bool public failIncoming;
    bool public failOutgoing;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function fail(bool incoming, bool outgoing) external { failIncoming = incoming; failOutgoing = outgoing; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failIncoming) return false;
        require(balanceOf[from] >= amount); balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failOutgoing) return false;
        require(balanceOf[msg.sender] >= amount); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}

contract OrderSettlementTest {
    VmOrder constant vm = VmOrder(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant warehouse = address(0xA11);
    address constant supplier = address(0xB22);
    address constant buyer = address(0xC33);
    bytes32 constant ID = keccak256("SHIP-001");
    uint256 constant U = 1e6;
    MockUSDC token;
    SupplyChainFinance p;
    function setUp() public {
        token = new MockUSDC(); p = new SupplyChainFinance(address(token), warehouse);
        p.registerOrder(ID, supplier, buyer, 100_000 * U);
        token.mint(address(p), 1_000_000 * U); token.mint(buyer, 100_000 * U);
        vm.prank(buyer); token.approve(address(p), 100_000 * U);
    }
    function _received(SupplyChainFinance q) internal { vm.prank(warehouse); q.recordGoodsReceived(ID, keccak256("receive"), 100_000 * U, 100); }
    function _deliver(SupplyChainFinance q) internal {
        vm.prank(warehouse); q.recordGoodsOutbound(ID, keccak256("outbound"));
        vm.prank(buyer); q.recordDelivery(ID, keccak256("delivery"));
    }
    function _financed() internal { _received(p); vm.prank(supplier); p.borrow(ID, 50_000 * U); _deliver(p); }
    function _settle() internal { vm.prank(buyer); p.settleOrder(ID); }
    function testBuyerPaymentClosesAndSplitsAtomically() public {
        _financed(); _settle();
        SupplyChainFinance.InventoryPosition memory pos = p.getPosition(ID);
        require(pos.buyer == buyer && pos.orderAmount == 100_000 * U && pos.buyerPaid, "Order");
        require(pos.status == SupplyChainFinance.PositionStatus.CLOSED && pos.outstandingDebt == 0, "Closed");
        require(pos.principalRepaid == 50_000 * U && pos.supplierProceeds == 50_000 * U, "Split");
        require(token.balanceOf(buyer) == 0 && token.balanceOf(supplier) == 100_000 * U, "Exact participants");
        require(token.balanceOf(address(p)) == 1_000_000 * U && p.availableCredit(ID) == 0, "Pool restored without new credit");
    }
    function testNoBorrowStillRequiresBuyerPayment() public {
        _received(p); _deliver(p);
        require(p.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED && !p.getPosition(ID).buyerPaid, "Delivery not payment");
        _settle();
        require(p.getPosition(ID).principalRepaid == 0 && p.getPosition(ID).supplierProceeds == 100_000 * U, "All proceeds");
        require(token.balanceOf(supplier) == 100_000 * U && token.balanceOf(address(p)) == 1_000_000 * U, "Exact transfer");
    }
    function testManualRepaymentDoesNotCloseUnpaidOrder() public {
        _financed(); vm.prank(supplier); token.approve(address(p), 50_000 * U);
        vm.prank(supplier); p.repay(ID, 50_000 * U);
        require(p.getPosition(ID).status == SupplyChainFinance.PositionStatus.DELIVERED && !p.getPosition(ID).buyerPaid, "Still unpaid");
        _settle();
        require(p.getPosition(ID).principalRepaid == 50_000 * U && p.getPosition(ID).supplierProceeds == 100_000 * U, "No double principal");
    }
    function testPartialManualRepaymentReducesSettlementPrincipal() public {
        _financed(); vm.prank(supplier); token.approve(address(p), 20_000 * U);
        vm.prank(supplier); p.repay(ID, 20_000 * U); _settle();
        require(p.getPosition(ID).principalRepaid == 50_000 * U && p.getPosition(ID).supplierProceeds == 70_000 * U, "Remaining principal split");
        require(token.balanceOf(address(p)) == 1_000_000 * U, "Pool receives principal once");
    }
    function testOnlyBuyerMayAcceptOrPay() public {
        _received(p); vm.prank(warehouse); p.recordGoodsOutbound(ID, keccak256("outbound"));
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); vm.prank(warehouse); p.recordDelivery(ID, keccak256("delivery"));
        vm.prank(buyer); p.recordDelivery(ID, keccak256("delivery"));
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); vm.prank(supplier); p.settleOrder(ID);
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); vm.prank(warehouse); p.settleOrder(ID);
    }
    function testCannotPayBeforeDeliveryOrTwice() public {
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); _settle();
        _financed(); _settle();
        vm.expectRevert(SupplyChainFinance.InvalidState.selector); _settle();
        require(token.balanceOf(buyer) == 0, "Charged once");
    }
    function testOrderPaymentLessThanDebtRejectsBeforeTransfers() public {
        SupplyChainFinance q = new SupplyChainFinance(address(token), warehouse);
        q.registerOrder(ID, supplier, buyer, 40_000 * U); token.mint(address(q), 100_000 * U);
        _received(q); vm.prank(supplier); q.borrow(ID, 50_000 * U); _deliver(q);
        vm.prank(buyer); token.approve(address(q), 100_000 * U);
        vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); vm.prank(buyer); q.settleOrder(ID);
        require(q.getPosition(ID).outstandingDebt == 50_000 * U && !q.getPosition(ID).buyerPaid, "No state change");
        require(token.balanceOf(buyer) == 100_000 * U, "No payment taken");
    }
    function testBuyerAllowanceAndBalanceFailureRollback() public {
        _financed(); vm.prank(buyer); token.approve(address(p), 99_999 * U);
        vm.expectRevert(bytes("Insufficient allowance")); _settle();
        require(!p.getPosition(ID).buyerPaid && p.getPosition(ID).outstandingDebt == 50_000 * U, "Allowance rollback");
        vm.prank(buyer); token.approve(address(p), 100_000 * U);
        vm.prank(buyer); token.transfer(address(0x999), U);
        vm.expectRevert(bytes("Insufficient balance")); _settle();
        require(!p.getPosition(ID).buyerPaid && p.getPosition(ID).supplierProceeds == 0 && p.getPosition(ID).principalRepaid == 0, "Balance rollback");
    }
    function testBothTransferFalsePathsRollbackAllEffects() public {
        FailingSettlementToken t = new FailingSettlementToken();
        SupplyChainFinance q = new SupplyChainFinance(address(t), warehouse);
        q.registerOrder(ID, supplier, buyer, 100_000 * U); t.mint(address(q), 1_000_000 * U); t.mint(buyer, 100_000 * U);
        _received(q); vm.prank(supplier); q.borrow(ID, 50_000 * U); _deliver(q);
        t.fail(true, false); vm.expectRevert(SupplyChainFinance.TransferFailed.selector); vm.prank(buyer); q.settleOrder(ID);
        t.fail(false, true); vm.expectRevert(SupplyChainFinance.TransferFailed.selector); vm.prank(buyer); q.settleOrder(ID);
        require(t.balanceOf(buyer) == 100_000 * U && t.balanceOf(address(q)) == 950_000 * U, "Incoming transfer reverted too");
        require(q.getPosition(ID).outstandingDebt == 50_000 * U && !q.getPosition(ID).buyerPaid && q.getPosition(ID).principalRepaid == 0 && q.getPosition(ID).supplierProceeds == 0, "All accounting rolled back");
    }
    function testRegistrationRejectsInvalidPartiesAndAmount() public {
        bytes32 other = keccak256("other");
        vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); p.registerOrder(other, supplier, address(0), U);
        vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); p.registerOrder(other, supplier, supplier, U);
        vm.expectRevert(SupplyChainFinance.InvalidAmount.selector); p.registerOrder(other, supplier, buyer, 0);
        vm.expectRevert(SupplyChainFinance.Unauthorized.selector); vm.prank(buyer); p.registerOrder(other, supplier, buyer, U);
    }
    function testFuzzSettlementSplitConservesFunds(uint64 rawBorrow) public {
        uint256 borrowed = uint256(rawBorrow) % (80_000 * U) + 1;
        _received(p); vm.prank(supplier); p.borrow(ID, borrowed); _deliver(p); _settle();
        require(p.getPosition(ID).principalRepaid + p.getPosition(ID).supplierProceeds == 100_000 * U, "Payment conservation");
        require(token.balanceOf(supplier) == 100_000 * U && token.balanceOf(address(p)) == 1_000_000 * U, "Participant conservation");
    }
}
