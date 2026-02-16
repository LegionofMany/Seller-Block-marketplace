// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract EscrowVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotAuthorized();
    error NotController();
    error InvalidState();
    error InvalidAmount();
    error EscrowExists();
    error InvalidEscrowId();
    error ZeroAddress();
    error InvalidToken();
    error InvalidValue();
    error NothingToWithdraw();
    error TransferFailed();

    enum Status {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Escrow {
        address buyer;
        address seller;
        address token; // address(0) = native ETH
        uint256 amount;
        Status status;
    }

    address public arbiter;
    address public controller;

    mapping(bytes32 => Escrow) private escrows;
    mapping(address => mapping(address => uint256)) private credits;

    event EscrowCreated(bytes32 indexed id, address buyer, address seller, address token, uint256 amount);
    event EscrowReleased(bytes32 indexed id, uint256 sellerAmount, address feeRecipient, uint256 feeAmount);
    event EscrowRefunded(bytes32 indexed id, uint256 amount);
    event ArbiterUpdated(address oldArbiter, address newArbiter);
    event ControllerUpdated(address oldController, address newController);
    event Withdrawal(address indexed recipient, address indexed token, uint256 amount);

    constructor(address owner_) Ownable(owner_) {}

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    function setController(address newController) external onlyOwner {
        if (newController == address(0)) revert ZeroAddress();
        emit ControllerUpdated(controller, newController);
        controller = newController;
    }

    function setArbiter(address newArbiter) external onlyOwner {
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    /// @notice Create an escrow funded by `payer`.
    /// @dev This contract always pulls ERC20 via allowance (spender = EscrowVault).
    ///      For native ETH escrows, `msg.value` must equal `amount`.
    function createEscrow(
        bytes32 id,
        address payer,
        address buyer,
        address seller,
        address token,
        uint256 amount
    ) external payable onlyController nonReentrant {
        if (id == bytes32(0)) revert InvalidEscrowId();
        if (escrows[id].status != Status.None) revert EscrowExists();
        if (amount == 0) revert InvalidAmount();
        if (buyer == address(0) || seller == address(0)) revert ZeroAddress();

        escrows[id] = Escrow({
            buyer: buyer,
            seller: seller,
            token: token,
            amount: amount,
            status: Status.Funded
        });

        if (token == address(0)) {
            if (msg.value != amount) revert InvalidValue();
        } else {
            if (msg.value != 0) revert InvalidValue();
            if (payer == address(0)) revert ZeroAddress();
            IERC20(token).safeTransferFrom(payer, address(this), amount);
        }

        emit EscrowCreated(id, buyer, seller, token, amount);
    }

    function release(bytes32 id, address feeRecipient, uint16 feeBps) external onlyController nonReentrant {
        Escrow storage e = escrows[id];
        if (e.status == Status.None) revert InvalidEscrowId();
        if (e.status != Status.Funded) revert InvalidState();
        if (feeRecipient == address(0)) revert ZeroAddress();

        uint256 feeAmount = (e.amount * uint256(feeBps)) / 10_000;
        uint256 sellerAmount = e.amount - feeAmount;

        e.status = Status.Released;
        credits[e.seller][e.token] += sellerAmount;
        if (feeAmount > 0) {
            credits[feeRecipient][e.token] += feeAmount;
        }

        emit EscrowReleased(id, sellerAmount, feeRecipient, feeAmount);
    }

    function refund(bytes32 id) external onlyController nonReentrant {
        Escrow storage e = escrows[id];
        if (e.status == Status.None) revert InvalidEscrowId();
        if (e.status != Status.Funded) revert InvalidState();
        e.status = Status.Refunded;
        credits[e.buyer][e.token] += e.amount;
        emit EscrowRefunded(id, e.amount);
    }

    function creditOf(address recipient, address token) external view returns (uint256) {
        return credits[recipient][token];
    }

    /// @notice Pull-based withdrawal executed via the controller.
    function withdraw(address token, address recipient) external onlyController nonReentrant returns (uint256 amount) {
        amount = credits[recipient][token];
        if (amount == 0) revert NothingToWithdraw();
        credits[recipient][token] = 0;

        if (token == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }

        emit Withdrawal(recipient, token, amount);
    }

    function getEscrow(bytes32 id) external view returns (Escrow memory) {
        Escrow memory e = escrows[id];
        if (e.status == Status.None) revert InvalidEscrowId();
        return e;
    }
}
