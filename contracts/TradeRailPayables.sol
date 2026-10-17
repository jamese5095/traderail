// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Test-only trade payments and partial receivable-backed loans.
/// Enterprise evidence and buyer credit are external assumptions; no legal assignment is enforced here.
contract TradeRailPayables {
    uint256 public constant protocolVersion = 5;
    struct Invoice {
        address buyer; address supplier; address financier;
        uint256 face; uint256 principal; uint256 interest; uint256 dueAt; uint256 quoteExpiry;
        bytes32 documentHash;
        bool approved; bool funded; bool settled; bool demoMatured;
    }
    address public immutable token;
    address public immutable source;
    bool public immutable demoMode;
    address public immutable capitalProvider;
    mapping(bytes32 => Invoice) private invoices;
    mapping(bytes32 => bool) public usedDocuments;
    bool private entered;
    error Unauthorized(); error InvalidState(); error InvalidTerms(); error TransferFailed(); error TooEarly();
    event DeliveryRecorded(bytes32 indexed id, bytes32 indexed documentHash, address supplier);
    event PayableApproved(bytes32 indexed id, address indexed buyer, uint256 amount, uint256 dueAt);
    event LoanOffered(bytes32 indexed id, address indexed financier, uint256 principal, uint256 interest, uint256 expiry);
    event LoanDisbursed(bytes32 indexed id, address indexed supplier, address indexed financier, uint256 principal, uint256 interest);
    event RepaymentAllocated(bytes32 indexed id, address indexed financier, uint256 principal, uint256 interest, uint256 supplierRemainder);
    event InvoiceSettled(bytes32 indexed id, address indexed buyer, address indexed supplier, uint256 amount);
    event DemoMaturityAdvanced(bytes32 indexed id, uint256 contractualDueAt);
    constructor(address stablecoin, address businessSource, address approvedFinancier, bool enableDemoClock) {
        if(stablecoin.code.length == 0 || businessSource == address(0) || approvedFinancier == address(0)) revert InvalidTerms();
        if(enableDemoClock && block.chainid != 10143 && block.chainid != 31337) revert InvalidTerms();
        token=stablecoin; source=businessSource; capitalProvider=approvedFinancier; demoMode=enableDemoClock;
    }
    modifier guarded(){ if(entered) revert InvalidState(); entered=true; _; entered=false; }
    function recordDelivery(bytes32 id, bytes32 doc, address buyer, address supplier, uint256 face) external {
        if(msg.sender!=source) revert Unauthorized();
        if(id==0||doc==0||buyer==address(0)||supplier==address(0)||buyer==supplier||buyer==address(this)||supplier==address(this)||face==0) revert InvalidTerms();
        if(invoices[id].buyer!=address(0)||usedDocuments[doc]) revert InvalidState();
        usedDocuments[doc]=true;
        invoices[id]=Invoice(buyer,supplier,address(0),face,0,0,0,0,doc,false,false,false,false);
        emit DeliveryRecorded(id,doc,supplier);
    }
    function approvePayable(bytes32 id, uint256 dueAt) external {
        Invoice storage i=invoices[id]; if(msg.sender!=i.buyer) revert Unauthorized();
        if(i.approved||dueAt<=block.timestamp) revert InvalidState();
        i.approved=true;i.dueAt=dueAt;emit PayableApproved(id,msg.sender,i.face,dueAt);
    }
    function offerLoan(bytes32 id,uint256 principal,uint256 interest,uint256 expiry) external {
        if(msg.sender!=capitalProvider) revert Unauthorized();
        Invoice storage i=invoices[id];
        if(!i.approved||i.settled||i.funded||i.financier!=address(0)) revert InvalidState();
        // Subtraction avoids overflow when untrusted terms are checked.
        if(msg.sender==i.buyer||msg.sender==i.supplier||principal==0||principal>=i.face||interest>i.face-principal||expiry<=block.timestamp||expiry>i.dueAt||i.demoMatured) revert InvalidTerms();
        i.financier=msg.sender;i.principal=principal;i.interest=interest;i.quoteExpiry=expiry;
        emit LoanOffered(id,msg.sender,principal,interest,expiry);
    }
    function drawLoan(bytes32 id,address financier,uint256 principal,uint256 interest) external guarded {
        Invoice storage i=invoices[id]; if(msg.sender!=i.supplier) revert Unauthorized();
        if(!i.approved||i.funded||i.settled||i.financier==address(0)||block.timestamp>i.quoteExpiry||block.timestamp>=i.dueAt||i.demoMatured) revert InvalidState();
        if(financier!=i.financier||principal!=i.principal||interest!=i.interest) revert InvalidTerms();
        i.funded=true;
        _transferFrom(financier,i.supplier,principal);
        emit LoanDisbursed(id,i.supplier,financier,principal,interest);
    }
    function settle(bytes32 id) external guarded {
        Invoice storage i=invoices[id];if(msg.sender!=i.buyer) revert Unauthorized();
        if(!i.approved||i.settled) revert InvalidState();
        if(block.timestamp<i.dueAt&&!i.demoMatured) revert TooEarly();
        i.settled=true;
        if(i.funded){
            uint256 repayment=i.principal+i.interest;
            uint256 remainder=i.face-repayment;
            _transferFrom(i.buyer,i.financier,repayment);
            if(remainder>0)_transferFrom(i.buyer,i.supplier,remainder);
            emit RepaymentAllocated(id,i.financier,i.principal,i.interest,remainder);
        }else{
            _transferFrom(i.buyer,i.supplier,i.face);
        }
        emit InvoiceSettled(id,i.buyer,i.supplier,i.face);
    }
    /// @notice Explicit test-only time compression, recorded onchain; never a real 60-day wait.
    function advanceDemoMaturity(bytes32 id) external {
        Invoice storage i=invoices[id];if(!demoMode||msg.sender!=i.buyer) revert Unauthorized();
        if(!i.approved||i.settled||i.demoMatured) revert InvalidState();
        i.demoMatured=true;emit DemoMaturityAdvanced(id,i.dueAt);
    }
    function getInvoice(bytes32 id) external view returns(Invoice memory){return invoices[id];}
    function _transferFrom(address from,address to,uint256 value) private {
        (bool ok,bytes memory r)=token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)",from,to,value));
        if(!ok||(r.length!=0&&(r.length!=32||!abi.decode(r,(bool))))) revert TransferFailed();
    }
}
