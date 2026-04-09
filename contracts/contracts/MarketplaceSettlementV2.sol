// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MarketplaceSettlementV2 is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidAmount();
    error InvalidFeeBps();
    error InvalidOrder();
    error InvalidOrderSignature();
    error InvalidBuyerSignature();
    error SignatureExpired();
    error OrderExpired();
    error OrderConsumed();
    error OrderAlreadyCancelled();
    error InvalidNonce();
    error EscrowExists();
    error EscrowNotFound();
    error InvalidStatus();
    error NotBuyer();
    error NotArbiter();
    error InvalidValue();
    error NothingToWithdraw();
    error TransferFailed();

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address seller,bytes32 listingId,address token,uint256 price,uint64 expiry,uint256 nonce,bytes32 termsHash)"
    );
    bytes32 public constant BUYER_ACCEPTANCE_TYPEHASH = keccak256(
        "BuyerAcceptance(bytes32 orderHash,address buyer,uint64 deadline)"
    );
    bytes32 public constant ESCROW_ACTION_TYPEHASH = keccak256(
        "EscrowAction(bytes32 escrowId,address buyer,uint8 action,uint64 deadline)"
    );

    uint8 public constant ACTION_CONFIRM_DELIVERY = 0;
    uint8 public constant ACTION_REQUEST_REFUND = 1;

    enum EscrowStatus {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Order {
        address seller;
        bytes32 listingId;
        address token;
        uint256 price;
        uint64 expiry;
        uint256 nonce;
        bytes32 termsHash;
    }

    struct EscrowRecord {
        bytes32 orderHash;
        bytes32 listingId;
        address seller;
        address buyer;
        address token;
        uint256 amount;
        EscrowStatus status;
    }

    struct PermitParams {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    uint16 public protocolFeeBps;
    address public feeRecipient;
    address public arbiter;

    mapping(bytes32 => bool) public cancelledOrders;
    mapping(bytes32 => bool) public consumedOrders;
    mapping(address => uint256) public minValidNonce;
    mapping(bytes32 => EscrowRecord) public escrows;
    mapping(address => mapping(address => uint256)) public claimableCredits;

    event OrderAccepted(
        bytes32 indexed orderHash,
        bytes32 indexed escrowId,
        bytes32 indexed listingId,
        address seller,
        address buyer,
        address token,
        uint256 amount,
        address relayer
    );
    event OrderCancelled(bytes32 indexed orderHash, address indexed seller, uint256 nonce);
    event NonceInvalidated(address indexed seller, uint256 minNonce);
    event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address indexed buyer, uint256 sellerAmount, uint256 feeAmount);
    event EscrowRefunded(bytes32 indexed escrowId, address indexed buyer, uint256 amount);
    event BuyerActionRelayed(bytes32 indexed escrowId, address indexed buyer, uint8 indexed action, address relayer);
    event ProtocolFeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event ArbiterUpdated(address oldArbiter, address newArbiter);
    event CreditAssigned(address indexed recipient, address indexed token, uint256 amount);
    event CreditWithdrawn(address indexed recipient, address indexed token, uint256 amount);

    constructor(address owner_, address feeRecipient_) Ownable(owner_) EIP712("MarketplaceSettlementV2", "1") {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        protocolFeeBps = 250;
    }

    receive() external payable {}

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert NotArbiter();
        _;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setProtocolFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert InvalidFeeBps();
        emit ProtocolFeeUpdated(protocolFeeBps, newFeeBps);
        protocolFeeBps = newFeeBps;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    function setArbiter(address newArbiter) external onlyOwner {
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function hashOrder(Order calldata order) external view returns (bytes32) {
        return _orderDigest(order);
    }

    function computeEscrowId(bytes32 orderHash, address buyer) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), orderHash, buyer));
    }

    function cancelOrder(Order calldata order) external {
        if (msg.sender != order.seller) revert InvalidOrder();
        bytes32 orderHash = _orderDigest(order);
        cancelledOrders[orderHash] = true;
        emit OrderCancelled(orderHash, order.seller, order.nonce);
    }

    function invalidateNonce(uint256 newMinNonce) external {
        if (newMinNonce <= minValidNonce[msg.sender]) revert InvalidNonce();
        minValidNonce[msg.sender] = newMinNonce;
        emit NonceInvalidated(msg.sender, newMinNonce);
    }

    function acceptOrder(
        Order calldata order,
        address buyer,
        uint64 buyerDeadline,
        bytes calldata sellerSignature,
        bytes calldata buyerSignature
    ) external payable whenNotPaused nonReentrant returns (bytes32 escrowId) {
        return _acceptOrder(order, buyer, buyerDeadline, sellerSignature, buyerSignature, msg.value);
    }

    function acceptOrderWithPermit(
        Order calldata order,
        address buyer,
        uint64 buyerDeadline,
        bytes calldata sellerSignature,
        bytes calldata buyerSignature,
        PermitParams calldata permitParams
    ) external whenNotPaused nonReentrant returns (bytes32 escrowId) {
        if (order.token == address(0)) revert InvalidOrder();
        IERC20Permit(order.token).permit(
            buyer,
            address(this),
            order.price,
            permitParams.deadline,
            permitParams.v,
            permitParams.r,
            permitParams.s
        );
        return _acceptOrder(order, buyer, buyerDeadline, sellerSignature, buyerSignature, 0);
    }

    function _acceptOrder(
        Order calldata order,
        address buyer,
        uint64 buyerDeadline,
        bytes calldata sellerSignature,
        bytes calldata buyerSignature,
        uint256 nativeValue
    ) internal returns (bytes32 escrowId) {
        if (buyer == address(0) || order.seller == address(0)) revert ZeroAddress();
        if (order.listingId == bytes32(0) || order.price == 0) revert InvalidOrder();
        if (order.expiry < block.timestamp) revert OrderExpired();
        if (buyerDeadline < block.timestamp) revert SignatureExpired();
        if (order.nonce < minValidNonce[order.seller]) revert InvalidNonce();

        bytes32 orderHash = _orderDigest(order);
        if (cancelledOrders[orderHash]) revert OrderAlreadyCancelled();
        if (consumedOrders[orderHash]) revert OrderConsumed();

        address recoveredSeller = ECDSA.recover(orderHash, sellerSignature);
        if (recoveredSeller != order.seller) revert InvalidOrderSignature();

        bytes32 buyerDigest = _hashTypedDataV4(
            keccak256(abi.encode(BUYER_ACCEPTANCE_TYPEHASH, orderHash, buyer, buyerDeadline))
        );
        address recoveredBuyer = ECDSA.recover(buyerDigest, buyerSignature);
        if (recoveredBuyer != buyer) revert InvalidBuyerSignature();

        escrowId = computeEscrowId(orderHash, buyer);
        if (escrows[escrowId].status != EscrowStatus.None) revert EscrowExists();

        consumedOrders[orderHash] = true;
        escrows[escrowId] = EscrowRecord({
            orderHash: orderHash,
            listingId: order.listingId,
            seller: order.seller,
            buyer: buyer,
            token: order.token,
            amount: order.price,
            status: EscrowStatus.Funded
        });

        if (order.token == address(0)) {
            if (nativeValue != order.price) revert InvalidValue();
        } else {
            if (nativeValue != 0) revert InvalidValue();
            IERC20(order.token).safeTransferFrom(buyer, address(this), order.price);
        }

        emit OrderAccepted(orderHash, escrowId, order.listingId, order.seller, buyer, order.token, order.price, msg.sender);
    }

    function confirmDelivery(bytes32 escrowId) external whenNotPaused nonReentrant {
        EscrowRecord storage escrow = _requireFundedEscrow(escrowId);
        if (msg.sender != escrow.buyer) revert NotBuyer();
        _releaseEscrow(escrowId, escrow);
    }

    function confirmDeliveryBySig(bytes32 escrowId, uint64 deadline, bytes calldata buyerSignature)
        external
        whenNotPaused
        nonReentrant
    {
        EscrowRecord storage escrow = _requireFundedEscrow(escrowId);
        if (deadline < block.timestamp) revert SignatureExpired();
        _verifyBuyerAction(escrowId, escrow.buyer, ACTION_CONFIRM_DELIVERY, deadline, buyerSignature);
        emit BuyerActionRelayed(escrowId, escrow.buyer, ACTION_CONFIRM_DELIVERY, msg.sender);
        _releaseEscrow(escrowId, escrow);
    }

    function requestRefund(bytes32 escrowId) external whenNotPaused nonReentrant {
        EscrowRecord storage escrow = _requireFundedEscrow(escrowId);
        if (msg.sender != escrow.buyer) revert NotBuyer();
        _refundEscrow(escrowId, escrow);
    }

    function requestRefundBySig(bytes32 escrowId, uint64 deadline, bytes calldata buyerSignature)
        external
        whenNotPaused
        nonReentrant
    {
        EscrowRecord storage escrow = _requireFundedEscrow(escrowId);
        if (deadline < block.timestamp) revert SignatureExpired();
        _verifyBuyerAction(escrowId, escrow.buyer, ACTION_REQUEST_REFUND, deadline, buyerSignature);
        emit BuyerActionRelayed(escrowId, escrow.buyer, ACTION_REQUEST_REFUND, msg.sender);
        _refundEscrow(escrowId, escrow);
    }

    function arbiterResolve(bytes32 escrowId, bool releaseToSeller) external whenNotPaused nonReentrant onlyArbiter {
        EscrowRecord storage escrow = _requireFundedEscrow(escrowId);
        if (releaseToSeller) {
            _releaseEscrow(escrowId, escrow);
        } else {
            _refundEscrow(escrowId, escrow);
        }
    }

    function withdrawCredit(address token) external nonReentrant returns (uint256 amount) {
        amount = claimableCredits[msg.sender][token];
        if (amount == 0) revert NothingToWithdraw();
        claimableCredits[msg.sender][token] = 0;

        if (token == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit CreditWithdrawn(msg.sender, token, amount);
    }

    function _requireFundedEscrow(bytes32 escrowId) internal view returns (EscrowRecord storage escrow) {
        escrow = escrows[escrowId];
        if (escrow.status == EscrowStatus.None) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Funded) revert InvalidStatus();
    }

    function _releaseEscrow(bytes32 escrowId, EscrowRecord storage escrow) internal {
        escrow.status = EscrowStatus.Released;

        uint256 feeAmount = (escrow.amount * uint256(protocolFeeBps)) / 10_000;
        uint256 sellerAmount = escrow.amount - feeAmount;

        _disburse(escrow.token, escrow.seller, sellerAmount);
        if (feeAmount > 0) {
            _disburse(escrow.token, feeRecipient, feeAmount);
        }

        emit EscrowReleased(escrowId, escrow.seller, escrow.buyer, sellerAmount, feeAmount);
    }

    function _refundEscrow(bytes32 escrowId, EscrowRecord storage escrow) internal {
        escrow.status = EscrowStatus.Refunded;
        _disburse(escrow.token, escrow.buyer, escrow.amount);
        emit EscrowRefunded(escrowId, escrow.buyer, escrow.amount);
    }

    function _disburse(address token, address recipient, uint256 amount) internal {
        if (amount == 0) return;
        if (recipient == address(0)) revert ZeroAddress();

        if (token == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            if (!ok) {
                claimableCredits[recipient][token] += amount;
                emit CreditAssigned(recipient, token, amount);
            }
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    function _verifyBuyerAction(
        bytes32 escrowId,
        address buyer,
        uint8 action,
        uint64 deadline,
        bytes calldata buyerSignature
    ) internal view {
        bytes32 actionDigest = _hashTypedDataV4(
            keccak256(abi.encode(ESCROW_ACTION_TYPEHASH, escrowId, buyer, action, deadline))
        );
        address recoveredBuyer = ECDSA.recover(actionDigest, buyerSignature);
        if (recoveredBuyer != buyer) revert InvalidBuyerSignature();
    }

    function _orderDigest(Order calldata order) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.seller,
                    order.listingId,
                    order.token,
                    order.price,
                    order.expiry,
                    order.nonce,
                    order.termsHash
                )
            )
        );
    }
}