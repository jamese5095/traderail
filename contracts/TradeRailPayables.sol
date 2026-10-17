// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Testnet prototype: enterprise evidence is attested, not independently verified.
/// Legal assignment is external; holder is the protocol's authorized payment recipient.
contract TradeRailPayables {
    struct Invoice {
        address buyer;
        address supplier;
        address financier;
        address holder;
        uint256 face;
        uint256 price;
        uint256 dueAt;
        uint256 quoteExpiry;
        bytes32 documentHash;
        bool approved;
        bool purchased;
        bool settled;
        bool demoMatured;
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
    event QuoteOffered(bytes32 indexed id, address indexed financier, uint256 price, uint256 expiry);
    event ReceivablePurchased(bytes32 indexed id, address indexed supplier, address indexed financier, uint256 price, uint256 face);
    event PaymentRecipientChanged(bytes32 indexed id, address previousHolder, address newHolder);
    event InvoiceSettled(bytes32 indexed id, address indexed buyer, address indexed recipient, uint256 amount);
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
        invoices[id]=Invoice(buyer,supplier,address(0),supplier,face,0,0,0,doc,false,false,false,false);
        emit DeliveryRecorded(id,doc,supplier);
    }
    function approvePayable(bytes32 id, uint256 dueAt) external {
        Invoice storage i=invoices[id]; if(msg.sender!=i.buyer) revert Unauthorized();
        if(i.approved||dueAt<=block.timestamp) revert InvalidState();
        i.approved=true;i.dueAt=dueAt;emit PayableApproved(id,msg.sender,i.face,dueAt);
    }
    function offerQuote(bytes32 id,uint256 price,uint256 expiry) external {
        if(msg.sender!=capitalProvider) revert Unauthorized();
        Invoice storage i=invoices[id];
        if(!i.approved||i.settled||i.purchased||i.financier!=address(0)) revert InvalidState();
        if(msg.sender==i.buyer||msg.sender==i.supplier||price==0||price>i.face||expiry<=block.timestamp||expiry>i.dueAt||i.demoMatured) revert InvalidTerms();
        i.financier=msg.sender;i.price=price;i.quoteExpiry=expiry;emit QuoteOffered(id,msg.sender,price,expiry);
    }
    function purchase(bytes32 id,address financier,uint256 price) external guarded {
        Invoice storage i=invoices[id]; if(msg.sender!=i.supplier) revert Unauthorized();
        if(!i.approved||i.purchased||i.settled||i.financier==address(0)||block.timestamp>i.quoteExpiry||block.timestamp>=i.dueAt||i.demoMatured) revert InvalidState();
        if(financier!=i.financier||price!=i.price) revert InvalidTerms();
        i.purchased=true;i.holder=financier;
        _transferFrom(financier,i.supplier,price);
        emit ReceivablePurchased(id,i.supplier,financier,price,i.face);
        emit PaymentRecipientChanged(id,i.supplier,financier);
    }
    function settle(bytes32 id) external guarded {
        Invoice storage i=invoices[id];if(msg.sender!=i.buyer) revert Unauthorized();
        if(!i.approved||i.settled) revert InvalidState();
        if(block.timestamp<i.dueAt&&!i.demoMatured) revert TooEarly();
        i.settled=true;_transferFrom(i.buyer,i.holder,i.face);
        emit InvoiceSettled(id,i.buyer,i.holder,i.face);
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
