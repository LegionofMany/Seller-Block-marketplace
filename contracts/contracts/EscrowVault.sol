// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract EscrowVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotAuthorized();
    error InvalidState();
    error InvalidAmount();
    error EscrowExists();
    error InvalidEscrowId();
    error ZeroAddress();

    enum Status {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Escrow {
        address buyer;
        address seller;
        IERC20 token;
        uint256 amount;
        Status status;
    }

    address public arbiter;
    mapping(bytes32 => Escrow) private escrows;

    event EscrowCreated(bytes32 indexed id, address buyer, address seller, address token, uint256 amount);
    event EscrowReleased(bytes32 indexed id);
    event EscrowRefunded(bytes32 indexed id);
    event ArbiterUpdated(address oldArbiter, address newArbiter);

    constructor(address owner_) Ownable(owner_) {}

    function setArbiter(address newArbiter) external onlyOwner {
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function createEscrow(
        bytes32 id,
        address seller,
        IERC20 token,
        uint256 amount
    ) external nonReentrant {
        if (escrows[id].status != Status.None) revert EscrowExists();
        if (amount == 0) revert InvalidAmount();
        if (seller == address(0)) revert ZeroAddress();
        if (address(token) == address(0)) revert ZeroAddress();

        escrows[id] = Escrow({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            status: Status.Funded
        });

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowCreated(id, msg.sender, seller, address(token), amount);
    }

    function release(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.status == Status.None) revert InvalidEscrowId();
        if (e.status != Status.Funded) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != arbiter) revert NotAuthorized();

        e.status = Status.Released;
        e.token.safeTransfer(e.seller, e.amount);
        emit EscrowReleased(id);
    }

    function refund(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.status == Status.None) revert InvalidEscrowId();
        if (e.status != Status.Funded) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != arbiter) revert NotAuthorized();

        e.status = Status.Refunded;
        e.token.safeTransfer(e.buyer, e.amount);
        emit EscrowRefunded(id);
    }

    function getEscrow(bytes32 id) external view returns (Escrow memory) {
        Escrow memory e = escrows[id];
        if (e.status == Status.None) revert InvalidEscrowId();
        return e;
    }
}
