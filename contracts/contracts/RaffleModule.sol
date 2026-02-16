// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RaffleModule is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error RaffleAlreadyExists();
    error RaffleNotFound();
    error RaffleAlreadyClosed();
    error InvalidTarget();
    error ZeroPurchase();
    error NotRegistry();
    error ZeroAddress();
    error InvalidTimes();
    error RaffleNotActive();
    error RaffleNotEnded();
    error NothingToWithdraw();
    error TransferFailed();
    error ProceedsAlreadyClaimed();
    error RaffleIsCanceled();
    error InvalidTicketPrice();
    error InvalidValue();
    error InvalidMinParticipants();

    struct Raffle {
        address token; // address(0) = native ETH
        uint64 startTime;
        uint64 endTime;
        uint256 ticketPrice;
        uint256 targetAmount;
        uint32 minParticipants;

        uint32 participantCount;
        uint256 totalTickets;
        uint256 raised;
        bool closed;
        bool canceled;
        bool successful;
        address winner;
        bool proceedsClaimed;
    }

    mapping(bytes32 => Raffle) public raffles;

    mapping(bytes32 => address[]) private participants;
    mapping(bytes32 => mapping(address => uint256)) private tickets;
    mapping(bytes32 => mapping(address => uint256)) private contributed;
    mapping(bytes32 => mapping(address => bool)) private isParticipant;

    address public registry;

    event TicketPurchased(bytes32 indexed raffleId, address buyer, uint256 ticketsBought, uint256 amount);
    event RaffleClosed(bytes32 indexed raffleId, bool successful);
    event RaffleCreated(bytes32 indexed raffleId, address token, uint64 startTime, uint64 endTime, uint256 ticketPrice, uint256 targetAmount, uint32 minParticipants);
    event WinnerSelected(bytes32 indexed raffleId, address winner, uint256 raised);
    event RegistryUpdated(address oldRegistry, address newRegistry);
    event RefundWithdrawn(bytes32 indexed raffleId, address buyer, uint256 amount);
    event ProceedsSwept(bytes32 indexed raffleId, address to, uint256 amount);
    event RaffleCanceled(bytes32 indexed raffleId);

    modifier onlyRegistry() {
        if (msg.sender != registry) revert NotRegistry();
        _;
    }

    constructor(address owner_) Ownable(owner_) {}

    function setRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert ZeroAddress();
        emit RegistryUpdated(registry, newRegistry);
        registry = newRegistry;
    }

    function createRaffle(
        bytes32 raffleId,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint256 ticketPrice,
        uint256 targetAmount,
        uint32 minParticipants
    ) external onlyRegistry {
        Raffle storage r = raffles[raffleId];
        if (r.startTime != 0 || r.raised != 0 || r.closed || r.canceled) revert RaffleAlreadyExists();
        if (endTime <= startTime) revert InvalidTimes();
        if (ticketPrice == 0) revert InvalidTicketPrice();
        if (targetAmount == 0) revert InvalidTarget();
        if (minParticipants == 0) revert InvalidMinParticipants();

        r.token = token;
        r.startTime = startTime;
        r.endTime = endTime;
        r.ticketPrice = ticketPrice;
        r.targetAmount = targetAmount;
        r.minParticipants = minParticipants;

        emit RaffleCreated(raffleId, token, startTime, endTime, ticketPrice, targetAmount, minParticipants);
    }

    function enterRaffle(bytes32 raffleId, address buyer, uint32 ticketCount) external payable onlyRegistry nonReentrant {
        Raffle storage r = raffles[raffleId];
        if (r.startTime == 0) revert RaffleNotFound();
        if (r.closed) revert RaffleAlreadyClosed();
        if (r.canceled) revert RaffleIsCanceled();

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < r.startTime || nowTs >= r.endTime) revert RaffleNotActive();
        if (ticketCount == 0) revert ZeroPurchase();

        uint256 amount = r.ticketPrice * uint256(ticketCount);
        if (r.token == address(0)) {
            if (msg.value != amount) revert InvalidValue();
        } else {
            if (msg.value != 0) revert InvalidValue();
            IERC20(r.token).safeTransferFrom(buyer, address(this), amount);
        }

        if (!isParticipant[raffleId][buyer]) {
            isParticipant[raffleId][buyer] = true;
            participants[raffleId].push(buyer);
            r.participantCount += 1;
        }

        tickets[raffleId][buyer] += uint256(ticketCount);
        contributed[raffleId][buyer] += amount;
        r.totalTickets += uint256(ticketCount);
        r.raised += amount;

        emit TicketPurchased(raffleId, buyer, uint256(ticketCount), amount);
    }

    function closeRaffle(bytes32 raffleId, uint256 randomSeed) external onlyRegistry nonReentrant returns (bool successful, address winner, uint256 raised, address token) {
        Raffle storage r = raffles[raffleId];
        if (r.startTime == 0) revert RaffleNotFound();
        if (r.closed) revert RaffleAlreadyClosed();
        if (r.canceled) revert RaffleIsCanceled();

        uint64 nowTs = uint64(block.timestamp);
        bool canClose = (nowTs >= r.endTime) || (r.raised >= r.targetAmount);
        if (!canClose) revert RaffleNotEnded();

        r.closed = true;
        r.successful = (r.participantCount >= r.minParticipants) && (r.raised >= r.targetAmount) && (r.totalTickets > 0);
        successful = r.successful;
        raised = r.raised;
        token = r.token;

        if (!r.successful) {
            emit RaffleClosed(raffleId, false);
            return (false, address(0), raised, token);
        }

        uint256 pick = randomSeed % r.totalTickets;
        address[] storage p = participants[raffleId];
        uint256 acc = 0;
        for (uint256 i = 0; i < p.length; i++) {
            acc += tickets[raffleId][p[i]];
            if (pick < acc) {
                winner = p[i];
                break;
            }
        }

        r.winner = winner;

        emit WinnerSelected(raffleId, winner, r.raised);
        emit RaffleClosed(raffleId, true);
        return (true, winner, raised, token);
    }

    function cancelRaffle(bytes32 raffleId) external onlyRegistry {
        Raffle storage r = raffles[raffleId];
        if (r.startTime == 0) revert RaffleNotFound();
        if (r.closed) revert RaffleAlreadyClosed();
        r.canceled = true;
        r.closed = true;
        r.successful = false;
        emit RaffleCanceled(raffleId);
        emit RaffleClosed(raffleId, false);
    }

    function refundAvailable(bytes32 raffleId, address buyer) external view returns (uint256) {
        Raffle storage r = raffles[raffleId];
        if (!r.closed || r.successful) return 0;
        return contributed[raffleId][buyer];
    }

    function withdrawRefund(bytes32 raffleId, address buyer) external onlyRegistry nonReentrant returns (uint256 amount) {
        Raffle storage r = raffles[raffleId];
        if (r.startTime == 0) revert RaffleNotFound();
        if (!r.closed || r.successful) revert NothingToWithdraw();
        amount = contributed[raffleId][buyer];
        if (amount == 0) revert NothingToWithdraw();
        contributed[raffleId][buyer] = 0;

        if (r.token == address(0)) {
            (bool ok, ) = payable(buyer).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(r.token).safeTransfer(buyer, amount);
        }

        emit RefundWithdrawn(raffleId, buyer, amount);
    }

    function sweepProceeds(bytes32 raffleId, address to) external onlyRegistry nonReentrant returns (uint256 amount, address token) {
        Raffle storage r = raffles[raffleId];
        if (!r.closed) revert RaffleNotActive();
        if (r.canceled) revert RaffleIsCanceled();
        if (!r.successful) revert NothingToWithdraw();
        if (r.proceedsClaimed) revert ProceedsAlreadyClaimed();

        r.proceedsClaimed = true;
        amount = r.raised;
        token = r.token;

        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }

        emit ProceedsSwept(raffleId, to, amount);
    }

    function getParticipants(bytes32 raffleId) external view returns (address[] memory) {
        return participants[raffleId];
    }

    function ticketsOf(bytes32 raffleId, address buyer) external view returns (uint256) {
        return tickets[raffleId][buyer];
    }

    function quoteEntry(bytes32 raffleId, uint32 ticketCount) external view returns (uint256 amount) {
        Raffle storage r = raffles[raffleId];
        if (r.startTime == 0) revert RaffleNotFound();
        amount = r.ticketPrice * uint256(ticketCount);
    }
}
