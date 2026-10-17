// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../TradeRailSettlement.sol";
import "../MockUSDC.sol";

interface VmRail {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
    function chainId(uint256) external;
}

contract RailFailToken {
    mapping(address => uint256) public balanceOf;
    address public blocked;

    function mint(address a, uint256 v) external {
        balanceOf[a] += v;
    }

    function blockRecipient(address a) external {
        blocked = a;
    }

    function transferFrom(address a, address b, uint256 v) external returns (bool) {
        require(balanceOf[a] >= v);
        balanceOf[a] -= v;
        balanceOf[b] += v;
        return true;
    }

    function transfer(address b, uint256 v) external returns (bool) {
        if (b == blocked) return false;
        require(balanceOf[msg.sender] >= v);
        balanceOf[msg.sender] -= v;
        balanceOf[b] += v;
        return true;
    }
}

contract TradeRailSettlementTest {
    VmRail constant vm = VmRail(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant U = 1e6;
    address buyer;
    address supplier;
    address lender;
    address source;
    MockUSDC token;
    TradeRailSettlement rail;

    function setUp() public {
        buyer = vm.addr(101);
        supplier = vm.addr(102);
        lender = vm.addr(103);
        source = vm.addr(104);
        token = new MockUSDC();
        rail = new TradeRailSettlement(address(token), source);
        token.mint(buyer, 1_000_000 * U);
        token.mint(lender, 1_000_000 * U);
        vm.prank(buyer);
        token.approve(address(rail), 1_000_000 * U);
        vm.prank(lender);
        token.approve(address(rail), 1_000_000 * U);
    }

    function sig(uint256 k, bytes32 d) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(k, d);
        return abi.encodePacked(r, s, v);
    }

    function terms(bytes32 id, bool f, uint256 p, uint256 i) private view returns (TradeRailSettlement.Terms memory) {
        return
            TradeRailSettlement.Terms(
                id, f ? 1 : 0, buyer, supplier, f ? lender : address(0), 100_000 * U, p, i, 0, block.timestamp + 1 days
            );
    }

    function reg(TradeRailSettlement q, TradeRailSettlement.Terms memory t) private {
        bytes32 d = q.termsDigest(t);
        q.registerOrder(t, sig(101, d), sig(102, d), t.mode == 1 ? sig(103, d) : bytes(""));
    }

    function ev(TradeRailSettlement q, bytes32 id, uint8 a, uint256 n)
        private
        view
        returns (TradeRailSettlement.BusinessEvent memory)
    {
        return TradeRailSettlement.BusinessEvent(
            id,
            keccak256(abi.encode(id, a, n)),
            q.getOrder(id).termsHash,
            keccak256("ERP-acceptance"),
            a,
            n,
            block.timestamp + 1 hours
        );
    }

    function fund(bytes32 id) private {
        reg(rail, terms(id, true, 50_000 * U, 1_000 * U));
        vm.prank(lender);
        rail.fundAdvance(id);
    }

    function draw(bytes32 id) private {
        fund(id);
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 1, 1);
        rail.drawAdvance(e, sig(104, rail.eventDigest(e)));
    }

    function pay(TradeRailSettlement q, bytes32 id) private {
        TradeRailSettlement.BusinessEvent memory e = ev(q, id, 2, 2);
        q.settlePayment(e, sig(104, q.eventDigest(e)));
    }

    function testDirectExact() public {
        bytes32 id = keccak256("direct");
        reg(rail, terms(id, false, 0, 0));
        pay(rail, id);
        require(
            token.balanceOf(supplier) == 100_000 * U && token.balanceOf(buyer) == 900_000 * U
                && token.balanceOf(address(rail)) == 0
        );
        require(rail.getOrder(id).paid && rail.getOrder(id).principalReturned == 0);
    }

    function testFinanceConservation() public {
        bytes32 id = keccak256("finance");
        draw(id);
        require(token.balanceOf(supplier) == 50_000 * U);
        pay(rail, id);
        require(
            token.balanceOf(supplier) == 99_000 * U && token.balanceOf(lender) == 1_001_000 * U
                && token.balanceOf(address(rail)) == 0
        );
        require(rail.getOrder(id).principalReturned == 50_000 * U && rail.getOrder(id).interestPaid == 1_000 * U);
    }

    function testDrawNeedsFunding() public {
        bytes32 id = keccak256("empty");
        reg(rail, terms(id, true, 50_000 * U, 1_000 * U));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 1, 1);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        rail.drawAdvance(e, s);
    }

    function testWrongLender() public {
        bytes32 id = keccak256("lender");
        reg(rail, terms(id, true, 50_000 * U, 1_000 * U));
        vm.expectRevert(TradeRailSettlement.Unauthorized.selector);
        vm.prank(buyer);
        rail.fundAdvance(id);
    }

    function testAllPartySignatures() public {
        TradeRailSettlement.Terms memory t = terms(keccak256("auth"), true, 50_000 * U, 1_000 * U);
        bytes32 d = rail.termsDigest(t);
        bytes memory b = sig(101, d);
        bytes memory s = sig(102, d);
        bytes memory wrong = sig(101, d);
        vm.expectRevert(TradeRailSettlement.Unauthorized.selector);
        rail.registerOrder(t, b, s, wrong);
    }

    function testTamperedInterest() public {
        TradeRailSettlement.Terms memory t = terms(keccak256("tamper"), true, 50_000 * U, 1_000 * U);
        bytes32 d = rail.termsDigest(t);
        bytes memory b = sig(101, d);
        bytes memory s = sig(102, d);
        bytes memory l = sig(103, d);
        t.interest += U;
        vm.expectRevert(TradeRailSettlement.Unauthorized.selector);
        rail.registerOrder(t, b, s, l);
    }

    function testWrongSource() public {
        bytes32 id = keccak256("source");
        reg(rail, terms(id, false, 0, 0));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(102, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.Unauthorized.selector);
        rail.settlePayment(e, s);
    }

    function testExpiredSource() public {
        bytes32 id = keccak256("expired");
        reg(rail, terms(id, false, 0, 0));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.warp(e.expiresAt + 1);
        vm.expectRevert(TradeRailSettlement.Expired.selector);
        rail.settlePayment(e, s);
    }

    function testCrossDeployment() public {
        bytes32 id = keccak256("domain");
        reg(rail, terms(id, false, 0, 0));
        TradeRailSettlement q = new TradeRailSettlement(address(token), source);
        reg(q, terms(id, false, 0, 0));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.Unauthorized.selector);
        q.settlePayment(e, s);
    }

    function testCrossChain() public {
        bytes32 id = keccak256("chain");
        reg(rail, terms(id, false, 0, 0));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.chainId(block.chainid + 1);
        vm.expectRevert(TradeRailSettlement.Unauthorized.selector);
        rail.settlePayment(e, s);
    }

    function testWrongActionOrTerms() public {
        bytes32 id = keccak256("action");
        reg(rail, terms(id, false, 0, 0));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 1, 1);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidTerms.selector);
        rail.settlePayment(e, s);
        e.action = 2;
        e.termsHash = keccak256("wrong");
        s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidTerms.selector);
        rail.settlePayment(e, s);
    }

    function testNoDuplicateMoney() public {
        bytes32 id = keccak256("twice");
        draw(id);
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        vm.prank(lender);
        rail.fundAdvance(id);
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 1, 1);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        rail.drawAdvance(e, s);
        pay(rail, id);
        e = ev(rail, id, 2, 2);
        s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        rail.settlePayment(e, s);
    }

    function testOrderEscrowIsolation() public {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        fund(a);
        reg(rail, terms(b, true, 50_000 * U, 1_000 * U));
        TradeRailSettlement.BusinessEvent memory e = ev(rail, b, 1, 1);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        rail.drawAdvance(e, s);
        require(rail.getOrder(a).escrow == 50_000 * U);
    }

    function testUnusedCapitalReturn() public {
        bytes32 id = keccak256("cancel");
        fund(id);
        vm.prank(lender);
        rail.cancelUnusedAdvance(id);
        require(token.balanceOf(lender) == 1_000_000 * U && rail.getOrder(id).canceled);
    }

    function testFinanceNeedsAdvance() public {
        bytes32 id = keccak256("early");
        fund(id);
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        rail.settlePayment(e, s);
    }

    function testAllowanceRevocation() public {
        bytes32 id = keccak256("revoke");
        reg(rail, terms(id, false, 0, 0));
        vm.prank(buyer);
        token.approve(address(rail), 0);
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.TransferFailed.selector);
        rail.settlePayment(e, s);
        require(!rail.getOrder(id).paid);
    }

    function testPaymentTime() public {
        bytes32 id = keccak256("time");
        TradeRailSettlement.Terms memory t = terms(id, false, 0, 0);
        t.notBefore = block.timestamp + 1 hours;
        reg(rail, t);
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 2, 2);
        bytes memory s = sig(104, rail.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.InvalidState.selector);
        rail.settlePayment(e, s);
    }

    function testOutgoingFailureRollsBackMoneyAndEvent() public {
        RailFailToken f = new RailFailToken();
        TradeRailSettlement q = new TradeRailSettlement(address(f), source);
        bytes32 id = keccak256("rollback");
        reg(q, terms(id, true, 50_000 * U, 1_000 * U));
        f.mint(buyer, 100_000 * U);
        f.mint(lender, 50_000 * U);
        vm.prank(lender);
        q.fundAdvance(id);
        TradeRailSettlement.BusinessEvent memory e = ev(q, id, 1, 1);
        q.drawAdvance(e, sig(104, q.eventDigest(e)));
        f.blockRecipient(supplier);
        e = ev(q, id, 2, 2);
        bytes memory s = sig(104, q.eventDigest(e));
        vm.expectRevert(TradeRailSettlement.TransferFailed.selector);
        q.settlePayment(e, s);
        require(
            f.balanceOf(buyer) == 100_000 * U && f.balanceOf(lender) == 0 && f.balanceOf(supplier) == 50_000 * U
                && !q.getOrder(id).paid
        );
        require(!q.consumedEvents(keccak256(abi.encode(source, e.eventId))));
    }

    function testFuzzMoneyConservation(uint64 rp, uint64 ri) public {
        uint256 p = uint256(rp) % (100_000 * U) + 1;
        uint256 i = uint256(ri) % (100_000 * U - p + 1);
        bytes32 id = keccak256("fuzz");
        reg(rail, terms(id, true, p, i));
        vm.prank(lender);
        rail.fundAdvance(id);
        TradeRailSettlement.BusinessEvent memory e = ev(rail, id, 1, 1);
        rail.drawAdvance(e, sig(104, rail.eventDigest(e)));
        pay(rail, id);
        require(
            token.balanceOf(supplier) == 100_000 * U - i && token.balanceOf(lender) == 1_000_000 * U + i
                && token.balanceOf(address(rail)) == 0
        );
    }
}
