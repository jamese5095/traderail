// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Test prototype. Enterprise signatures attest conditions, not physical truth.
contract TradeRailSettlement {
    struct Terms {
        bytes32 id;
        uint8 mode;
        address buyer;
        address supplier;
        address lender;
        uint256 amount;
        uint256 principal;
        uint256 interest;
        uint256 notBefore;
        uint256 expiresAt;
    }

    struct BusinessEvent {
        bytes32 orderId;
        bytes32 eventId;
        bytes32 termsHash;
        bytes32 recordCommitment;
        uint8 action;
        uint256 nonce;
        uint256 expiresAt;
    }

    struct Order {
        Terms terms;
        bytes32 termsHash;
        uint256 escrow;
        bool drawn;
        bool paid;
        bool canceled;
        uint256 principalReturned;
        uint256 interestPaid;
        uint256 supplierProceeds;
    }
    bytes32 public constant TERMS_TYPEHASH = keccak256(
        "Terms(bytes32 id,uint8 mode,address buyer,address supplier,address lender,uint256 amount,uint256 principal,uint256 interest,uint256 notBefore,uint256 expiresAt)"
    );
    bytes32 public constant EVENT_TYPEHASH = keccak256(
        "BusinessEvent(bytes32 orderId,bytes32 eventId,bytes32 termsHash,bytes32 recordCommitment,uint8 action,uint256 nonce,uint256 expiresAt)"
    );
    address public immutable token;
    address public immutable businessSource;
    mapping(bytes32 => Order) private orders;
    mapping(bytes32 => bool) public consumedEvents;
    bool private entered;
    error Unauthorized();
    error InvalidTerms();
    error InvalidState();
    error Expired();
    error Replay();
    error TransferFailed();
    event OrderRegistered(bytes32 indexed id, uint8 mode, bytes32 termsHash);
    event CapitalFunded(bytes32 indexed id, address indexed lender, uint256 amount);
    event AdvanceDisbursed(bytes32 indexed id, bytes32 indexed eventId, address indexed supplier, uint256 amount);
    event PaymentSettled(
        bytes32 indexed id,
        bytes32 indexed eventId,
        address indexed buyer,
        uint256 payment,
        uint256 principal,
        uint256 interest,
        uint256 supplierProceeds
    );
    event CapitalReturned(bytes32 indexed id, address indexed lender, uint256 amount);

    constructor(address stablecoin, address source) {
        if (stablecoin == address(0) || source == address(0)) revert InvalidTerms();
        token = stablecoin;
        businessSource = source;
    }
    modifier guarded() {
        if (entered) revert InvalidState();
        entered = true;
        _;
        entered = false;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("TradeRail"),
                keccak256("3"),
                block.chainid,
                address(this)
            )
        );
    }

    function hashTerms(Terms memory t) public pure returns (bytes32) {
        return keccak256(abi.encode(TERMS_TYPEHASH, t));
    }

    function termsDigest(Terms memory t) public view returns (bytes32) {
        return _digest(hashTerms(t));
    }

    function eventDigest(BusinessEvent memory e) public view returns (bytes32) {
        return _digest(keccak256(abi.encode(EVENT_TYPEHASH, e)));
    }

    function _digest(bytes32 h) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), h));
    }

    function _recover(bytes32 digest, bytes memory signature) private pure returns (address signer) {
        if (signature.length != 65) revert Unauthorized();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 || (v != 27 && v != 28)) {
            revert Unauthorized();
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert Unauthorized();
    }

    function registerOrder(
        Terms calldata t,
        bytes calldata buyerSignature,
        bytes calldata supplierSignature,
        bytes calldata lenderSignature
    ) external {
        if (t.expiresAt < block.timestamp) revert Expired();
        if (
            t.id == bytes32(0) || t.amount == 0 || t.buyer == address(0) || t.supplier == address(0)
                || t.buyer == t.supplier || t.buyer == address(this) || t.supplier == address(this) || t.mode > 1
        ) revert InvalidTerms();
        if (orders[t.id].terms.buyer != address(0)) revert InvalidState();
        if (t.mode == 0) {
            if (t.principal != 0 || t.interest != 0 || t.lender != address(0)) revert InvalidTerms();
        } else if (
            t.principal == 0 || t.principal > t.amount || t.interest > t.amount - t.principal || t.lender == address(0)
                || t.lender == t.buyer || t.lender == t.supplier || t.lender == address(this)
        ) {
            revert InvalidTerms();
        }
        bytes32 d = termsDigest(t);
        if (_recover(d, buyerSignature) != t.buyer || _recover(d, supplierSignature) != t.supplier) revert Unauthorized();
        if (t.mode == 1 && _recover(d, lenderSignature) != t.lender) revert Unauthorized();
        Order storage o = orders[t.id];
        o.terms = t;
        o.termsHash = hashTerms(t);
        emit OrderRegistered(t.id, t.mode, o.termsHash);
    }

    function fundAdvance(bytes32 id) external guarded {
        Order storage o = _order(id);
        if (msg.sender != o.terms.lender) revert Unauthorized();
        if (o.terms.mode != 1 || o.escrow != 0 || o.drawn || o.paid || o.canceled) revert InvalidState();
        o.escrow = o.terms.principal;
        _transferFrom(msg.sender, address(this), o.escrow);
        emit CapitalFunded(id, msg.sender, o.escrow);
    }

    function drawAdvance(BusinessEvent calldata e, bytes calldata signature) external guarded {
        Order storage o = _order(e.orderId);
        if (o.terms.mode != 1 || o.drawn || o.paid || o.canceled || o.escrow != o.terms.principal) revert InvalidState();
        _verify(o, e, signature, 1);
        uint256 amount = o.escrow;
        o.escrow = 0;
        o.drawn = true;
        _transfer(o.terms.supplier, amount);
        emit AdvanceDisbursed(e.orderId, e.eventId, o.terms.supplier, amount);
    }

    function settlePayment(BusinessEvent calldata e, bytes calldata signature) external guarded {
        Order storage o = _order(e.orderId);
        if (o.paid || o.canceled || (o.terms.mode == 1 && !o.drawn)) revert InvalidState();
        if (block.timestamp < o.terms.notBefore) revert InvalidState();
        _verify(o, e, signature, 2);
        uint256 principal = o.drawn ? o.terms.principal : 0;
        uint256 interest = o.drawn ? o.terms.interest : 0;
        uint256 proceeds = o.terms.amount - principal - interest;
        o.paid = true;
        o.principalReturned = principal;
        o.interestPaid = interest;
        o.supplierProceeds = proceeds;
        _transferFrom(o.terms.buyer, address(this), o.terms.amount);
        if (principal + interest > 0) _transfer(o.terms.lender, principal + interest);
        if (proceeds > 0) _transfer(o.terms.supplier, proceeds);
        emit PaymentSettled(e.orderId, e.eventId, o.terms.buyer, o.terms.amount, principal, interest, proceeds);
    }

    /// @notice Return isolated unused capital before disbursement; paid/drawn orders cannot be canceled.
    function cancelUnusedAdvance(bytes32 id) external guarded {
        Order storage o = _order(id);
        if (msg.sender != o.terms.lender) revert Unauthorized();
        if (o.terms.mode != 1 || o.drawn || o.paid || o.canceled) revert InvalidState();
        uint256 amount = o.escrow;
        o.escrow = 0;
        o.canceled = true;
        if (amount > 0) _transfer(o.terms.lender, amount);
        emit CapitalReturned(id, msg.sender, amount);
    }

    function _verify(Order storage o, BusinessEvent calldata e, bytes calldata signature, uint8 action) private {
        if (e.expiresAt < block.timestamp) revert Expired();
        if (
            e.action != action || e.eventId == bytes32(0) || e.recordCommitment == bytes32(0)
                || e.termsHash != o.termsHash
        ) {
            revert InvalidTerms();
        }
        bytes32 key = keccak256(abi.encode(businessSource, e.eventId));
        if (consumedEvents[key]) revert Replay();
        if (_recover(eventDigest(e), signature) != businessSource) revert Unauthorized();
        consumedEvents[key] = true;
    }

    function _order(bytes32 id) private view returns (Order storage o) {
        o = orders[id];
        if (o.terms.buyer == address(0)) revert InvalidState();
    }

    function getOrder(bytes32 id) external view returns (Order memory) {
        return _order(id);
    }

    function _call(bytes memory data) private {
        (bool ok, bytes memory result) = token.call(data);
        if (!ok || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) revert TransferFailed();
    }

    function _transfer(address to, uint256 amount) private {
        _call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
    }

    function _transferFrom(address from, address to, uint256 amount) private {
        _call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount));
    }
}
