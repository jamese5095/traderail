// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../TradeRailPayables.sol";
import "../MockUSDC.sol";
interface VmPay {function prank(address) external;function expectRevert(bytes4) external;function warp(uint256) external;function chainId(uint256) external;}
contract TradeRailPayablesTest {
 VmPay constant vm=VmPay(address(uint160(uint256(keccak256("hevm cheat code")))));
 TradeRailPayables p;MockUSDC t;address b=address(11);address s=address(12);address f=address(13);bytes32 id=keccak256("invoice");
 function setUp() public {vm.chainId(31337);t=new MockUSDC();p=new TradeRailPayables(address(t),address(this),f,true);t.mint(b,100000e6);t.mint(f,50000e6);vm.prank(b);t.approve(address(p),100000e6);vm.prank(f);t.approve(address(p),50000e6);p.recordDelivery(id,keccak256("doc"),b,s,100000e6);}
 function approve() private {vm.prank(b);p.approvePayable(id,block.timestamp+60 days);}
 function quote() private {approve();vm.prank(f);p.offerLoan(id,50000e6,1000e6,block.timestamp+1 days);}
 function borrow() private {quote();vm.prank(s);p.drawLoan(id,f,50000e6,1000e6);}
 function testPartialLoanAndSplitSettlement() public {borrow();require(t.balanceOf(s)==50000e6&&p.getInvoice(id).funded);vm.warp(block.timestamp+60 days);vm.prank(b);p.settle(id);require(t.balanceOf(f)==51000e6&&t.balanceOf(b)==0&&t.balanceOf(s)==99000e6&&p.getInvoice(id).settled);}
 function testDirectPayment() public {approve();vm.warp(block.timestamp+60 days);vm.prank(b);p.settle(id);require(t.balanceOf(s)==100000e6&&!p.getInvoice(id).funded);}
 function testWrongBuyer() public {vm.expectRevert(TradeRailPayables.Unauthorized.selector);p.approvePayable(id,block.timestamp+1 days);}
 function testNoQuoteBeforeApproval() public {vm.expectRevert(TradeRailPayables.InvalidState.selector);vm.prank(f);p.offerLoan(id,50000e6,1000e6,block.timestamp+1 days);}
 function testWrongSupplier() public {quote();vm.expectRevert(TradeRailPayables.Unauthorized.selector);vm.prank(b);p.drawLoan(id,f,50000e6,1000e6);}
 function testCannotDuplicateDocument() public {vm.expectRevert(TradeRailPayables.InvalidState.selector);p.recordDelivery(keccak256("other"),keccak256("doc"),b,s,100000e6);}
 function testNoDoubleBorrowOrPay() public {borrow();vm.expectRevert(TradeRailPayables.InvalidState.selector);vm.prank(s);p.drawLoan(id,f,50000e6,1000e6);vm.warp(block.timestamp+60 days);vm.prank(b);p.settle(id);vm.expectRevert(TradeRailPayables.InvalidState.selector);vm.prank(b);p.settle(id);}
 function testRollbackOnTransferFailure() public {quote();vm.prank(f);t.approve(address(p),0);vm.expectRevert(TradeRailPayables.TransferFailed.selector);vm.prank(s);p.drawLoan(id,f,50000e6,1000e6);require(!p.getInvoice(id).funded&&t.balanceOf(s)==0);}
 function testNoEarlySettlement() public {borrow();vm.expectRevert(TradeRailPayables.TooEarly.selector);vm.prank(b);p.settle(id);}
 function testExplicitTestClock() public {borrow();vm.prank(b);p.advanceDemoMaturity(id);vm.prank(b);p.settle(id);require(p.getInvoice(id).settled&&p.getInvoice(id).demoMatured);}
 function testQuoteExpiry() public {quote();vm.warp(block.timestamp+2 days);vm.expectRevert(TradeRailPayables.InvalidState.selector);vm.prank(s);p.drawLoan(id,f,50000e6,1000e6);}
 function testPriceTampering() public {quote();vm.expectRevert(TradeRailPayables.InvalidTerms.selector);vm.prank(s);p.drawLoan(id,f,49000e6,1000e6);}
 function testNoDemoClockOnProductionChain() public {vm.chainId(1);vm.expectRevert(TradeRailPayables.InvalidTerms.selector);new TradeRailPayables(address(t),address(this),f,true);}
 function testUnapprovedFinancierRejected() public {approve();vm.expectRevert(TradeRailPayables.Unauthorized.selector);vm.prank(address(99));p.offerLoan(id,50000e6,1000e6,block.timestamp+1 days);}
 function testMaturityTransferFailureKeepsReceivableOpen() public {borrow();vm.warp(block.timestamp+60 days);vm.prank(b);t.approve(address(p),0);vm.expectRevert(TradeRailPayables.TransferFailed.selector);vm.prank(b);p.settle(id);require(!p.getInvoice(id).settled&&p.getInvoice(id).funded&&t.balanceOf(f)==0);}
 function testWrongBusinessSource() public {vm.expectRevert(TradeRailPayables.Unauthorized.selector);vm.prank(s);p.recordDelivery(keccak256("forged"),keccak256("forged-doc"),b,s,100000e6);}
 function testBorrowAfterMaturityRejected() public {quote();vm.prank(b);p.advanceDemoMaturity(id);vm.expectRevert(TradeRailPayables.InvalidState.selector);vm.prank(s);p.drawLoan(id,f,50000e6,1000e6);}
 function testUnacceptedOfferDoesNotCreateDebt() public {quote();vm.warp(block.timestamp+60 days);vm.prank(b);p.settle(id);require(t.balanceOf(s)==100000e6&&t.balanceOf(f)==50000e6&&!p.getInvoice(id).funded);}
 function testInterestTampering() public {quote();vm.expectRevert(TradeRailPayables.InvalidTerms.selector);vm.prank(s);p.drawLoan(id,f,50000e6,0);}
 function testRepaymentCannotExceedFace() public {approve();vm.expectRevert(TradeRailPayables.InvalidTerms.selector);vm.prank(f);p.offerLoan(id,50000e6,50001e6,block.timestamp+1 days);}
 function testZeroAndFullPrincipalRejected() public {approve();vm.expectRevert(TradeRailPayables.InvalidTerms.selector);vm.prank(f);p.offerLoan(id,0,1000e6,block.timestamp+1 days);vm.expectRevert(TradeRailPayables.InvalidTerms.selector);vm.prank(f);p.offerLoan(id,100000e6,0,block.timestamp+1 days);}
 function testSecondMaturityTransferFailureRevertsBothTransfers() public {borrow();vm.warp(block.timestamp+60 days);vm.prank(b);t.transfer(address(99),49000e6);vm.expectRevert(TradeRailPayables.TransferFailed.selector);vm.prank(b);p.settle(id);require(!p.getInvoice(id).settled&&t.balanceOf(f)==0&&t.balanceOf(s)==50000e6&&t.balanceOf(b)==51000e6);}
}
