// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Settlement {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice A trusted warehouse attests economic events. No upgradeability or liquidation.
/// @dev All monetary values use settlement-token base units (6 decimals for MockUSDC).
contract SupplyChainFinance {
    enum PositionStatus { NONE, RECEIVED, COLLATERALIZED, OUTBOUND, DELIVERED, CLOSED }
    struct InventoryPosition {
        bytes32 shipmentId;
        address supplier;
        uint256 verifiedInventoryValue;
        uint256 borrowingPower;
        uint256 outstandingDebt;
        uint256 quantity;
        PositionStatus status;
        address buyer;
        uint256 orderAmount;
        bool buyerPaid;
        uint256 principalRepaid;
        uint256 supplierProceeds;
    }

    uint256 public constant LTV_BPS = 8_000;
    address public immutable owner;
    address public immutable warehouse;
    IERC20Settlement public immutable settlementToken;
    mapping(bytes32 => InventoryPosition) private positions;
    mapping(bytes32 => bool) public processedEvents;
    bool private entered;

    error Unauthorized();
    error InvalidState();
    error InvalidAmount();
    error EventAlreadyProcessed();
    error CreditExceeded();
    error TransferFailed();

    event OrderRegistered(bytes32 indexed shipmentId, address indexed supplier, address indexed buyer, uint256 orderAmount);
    event OrderSettled(bytes32 indexed shipmentId, address indexed buyer, uint256 payment, uint256 principal, uint256 supplierProceeds);
    event ShipmentRegistered(bytes32 indexed shipmentId, address indexed supplier);
    event GoodsReceived(bytes32 indexed shipmentId, bytes32 indexed eventId, uint256 value, uint256 quantity);
    event InspectionPassed(bytes32 indexed shipmentId, bytes32 indexed eventId);
    event Borrowed(bytes32 indexed shipmentId, address indexed supplier, uint256 amount);
    event Repaid(bytes32 indexed shipmentId, address indexed supplier, uint256 amount);
    event GoodsOutbound(bytes32 indexed shipmentId, bytes32 indexed eventId, uint256 debtAtExit);
    event Delivered(bytes32 indexed shipmentId, bytes32 indexed eventId, uint256 receivableValue);
    event FinancialStateChanged(bytes32 indexed shipmentId, uint256 verifiedInventoryValue, uint256 borrowingPower, uint256 outstandingDebt, PositionStatus status);

    constructor(address token, address trustedWarehouse) {
        require(token != address(0) && trustedWarehouse != address(0), "Zero address");
        owner = msg.sender;
        warehouse = trustedWarehouse;
        settlementToken = IERC20Settlement(token);
    }

    modifier onlyWarehouse() { if (msg.sender != warehouse) revert Unauthorized(); _; }
    modifier nonReentrant() { require(!entered, "Reentrant"); entered = true; _; entered = false; }

    /// @notice Legacy registration has no payable order; V2 integrations must use registerOrder.
    function registerShipment(bytes32 shipmentId, address supplier) external {
        _register(shipmentId, supplier, warehouse, 0);
    }

    function registerOrder(bytes32 shipmentId, address supplier, address buyer, uint256 orderAmount) external {
        if (orderAmount == 0 || buyer == address(0) || buyer == supplier || buyer == address(this) || supplier == address(this)) revert InvalidAmount();
        _register(shipmentId, supplier, buyer, orderAmount);
        emit OrderRegistered(shipmentId, supplier, buyer, orderAmount);
    }

    function _register(bytes32 shipmentId, address supplier, address buyer, uint256 orderAmount) internal {
        if (msg.sender != owner) revert Unauthorized();
        if (shipmentId == bytes32(0) || supplier == address(0)) revert InvalidAmount();
        if (positions[shipmentId].supplier != address(0)) revert InvalidState();
        InventoryPosition storage p = positions[shipmentId];
        p.shipmentId = shipmentId;
        p.supplier = supplier;
        p.buyer = buyer;
        p.orderAmount = orderAmount;
        emit ShipmentRegistered(shipmentId, supplier);
    }

    function recordGoodsReceived(bytes32 id, bytes32 eventId, uint256 value, uint256 quantity) external onlyWarehouse {
        InventoryPosition storage p = _position(id);
        if (p.status != PositionStatus.NONE) revert InvalidState();
        if (value == 0 || quantity == 0) revert InvalidAmount();
        _consume(eventId);
        p.verifiedInventoryValue = value;
        p.borrowingPower = value * LTV_BPS / 10_000;
        p.quantity = quantity;
        p.status = PositionStatus.RECEIVED;
        emit GoodsReceived(id, eventId, value, quantity);
        _emitState(p);
    }

    function recordInspectionPassed(bytes32 id, bytes32 eventId) external onlyWarehouse {
        InventoryPosition storage p = _position(id);
        if (p.status != PositionStatus.RECEIVED && p.status != PositionStatus.COLLATERALIZED) revert InvalidState();
        _consume(eventId);
        emit InspectionPassed(id, eventId);
        _emitState(p);
    }

    function borrow(bytes32 id, uint256 amount) external nonReentrant {
        InventoryPosition storage p = _position(id);
        if (msg.sender != p.supplier) revert Unauthorized();
        if (p.status != PositionStatus.RECEIVED && p.status != PositionStatus.COLLATERALIZED) revert InvalidState();
        if (amount == 0) revert InvalidAmount();
        if (p.outstandingDebt + amount > p.borrowingPower) revert CreditExceeded();
        p.outstandingDebt += amount;
        p.status = PositionStatus.COLLATERALIZED;
        if (!settlementToken.transfer(p.supplier, amount)) revert TransferFailed();
        emit Borrowed(id, p.supplier, amount);
        _emitState(p);
    }

    /// @notice Return principal to the demo pool. No interest or lender-share accounting.
    /// @dev Repayment cannot restore collateral eligibility after goods leave the warehouse.
    function repay(bytes32 id, uint256 amount) external nonReentrant {
        InventoryPosition storage p = _position(id);
        if (msg.sender != p.supplier) revert Unauthorized();
        if (amount == 0 || amount > p.outstandingDebt) revert InvalidAmount();
        p.outstandingDebt -= amount;
        p.principalRepaid += amount;
        // A supplier principal repayment is not the buyer's order payment.
        // Only settleOrder can close the order after buyerPaid becomes true.
        if (!settlementToken.transferFrom(p.supplier, address(this), amount)) revert TransferFailed();
        emit Repaid(id, p.supplier, amount);
        _emitState(p);
    }

    /// @notice Collateral eligibility ends, but debt and historical attested value persist.
    function recordGoodsOutbound(bytes32 id, bytes32 eventId) external onlyWarehouse {
        InventoryPosition storage p = _position(id);
        if (p.status != PositionStatus.RECEIVED && p.status != PositionStatus.COLLATERALIZED) revert InvalidState();
        _consume(eventId);
        p.borrowingPower = 0;
        p.status = PositionStatus.OUTBOUND;
        emit GoodsOutbound(id, eventId, p.outstandingDebt);
        _emitState(p);
    }

    /// @notice The registered buyer acknowledges delivery; warehouse attestation cannot substitute for acceptance.
    function recordDelivery(bytes32 id, bytes32 eventId) external {
        InventoryPosition storage p = _position(id);
        if (msg.sender != p.buyer) revert Unauthorized();
        if (p.status != PositionStatus.OUTBOUND) revert InvalidState();
        _consume(eventId);
        p.borrowingPower = 0;
        p.status = PositionStatus.DELIVERED;
        emit Delivered(id, eventId, p.verifiedInventoryValue);
        _emitState(p);
    }

    /// @notice One full order payment atomically repays remaining principal and pays supplier proceeds.
    /// @dev No interest, fees, invoice token, or arbitrary payment recipient. All effects roll back on transfer failure.
    function settleOrder(bytes32 id) external nonReentrant {
        InventoryPosition storage p = _position(id);
        if (msg.sender != p.buyer) revert Unauthorized();
        if (p.status != PositionStatus.DELIVERED || p.buyerPaid) revert InvalidState();
        uint256 payment = p.orderAmount;
        uint256 principal = p.outstandingDebt;
        if (payment == 0 || payment < principal) revert InvalidAmount();
        uint256 proceeds = payment - principal;
        p.buyerPaid = true;
        p.outstandingDebt = 0;
        p.principalRepaid += principal;
        p.supplierProceeds = proceeds;
        p.borrowingPower = 0;
        p.status = PositionStatus.CLOSED;
        if (!settlementToken.transferFrom(p.buyer, address(this), payment)) revert TransferFailed();
        if (proceeds > 0 && !settlementToken.transfer(p.supplier, proceeds)) revert TransferFailed();
        emit OrderSettled(id, p.buyer, payment, principal, proceeds);
        _emitState(p);
    }

    function getPosition(bytes32 id) external view returns (InventoryPosition memory) { return positions[id]; }

    function availableCredit(bytes32 id) external view returns (uint256) {
        InventoryPosition storage p = positions[id];
        return p.borrowingPower > p.outstandingDebt ? p.borrowingPower - p.outstandingDebt : 0;
    }

    /// @notice Any demo lender can replenish the pool with approved mock USDC.
    function fundPool(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (!settlementToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function _position(bytes32 id) internal view returns (InventoryPosition storage p) {
        p = positions[id];
        if (p.supplier == address(0)) revert InvalidState();
    }
    function _consume(bytes32 eventId) internal {
        if (eventId == bytes32(0)) revert InvalidAmount();
        if (processedEvents[eventId]) revert EventAlreadyProcessed();
        processedEvents[eventId] = true;
    }
    function _emitState(InventoryPosition storage p) internal {
        emit FinancialStateChanged(p.shipmentId, p.verifiedInventoryValue, p.borrowingPower, p.outstandingDebt, p.status);
    }
}
