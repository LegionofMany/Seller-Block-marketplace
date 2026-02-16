// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AuctionModule is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error AuctionAlreadyExists();
    error AuctionNotFound();
    error AuctionAlreadyClosed();
    error AuctionNotActive();
    error LowBid();
    error NotRegistry();
    error ZeroAddress();
    error InvalidTimes();
    error AuctionNotEnded();
    error InvalidValue();
    error NothingToWithdraw();
    error TransferFailed();
    error ProceedsAlreadyClaimed();
    error AuctionIsCanceled();

    struct Auction {
        address token; // address(0) = native ETH
        uint64 startTime;
        uint64 endTime;
        uint64 extensionWindow;
        uint64 extensionSeconds;
        uint256 reservePrice;
        uint256 minBidIncrement;

        address highestBidder;
        uint256 highestBid;

        bool active;
        bool canceled;
        bool closed;
        bool proceedsClaimed;
        address winner;
        uint256 winningBid;
    }

    mapping(bytes32 => Auction) public auctions;
    mapping(bytes32 => mapping(address => uint256)) private pendingReturns;

    address public registry;

    event BidPlaced(bytes32 indexed auctionId, address bidder, uint256 amount, uint64 endTime);
    event AuctionClosed(bytes32 indexed auctionId, address winner, uint256 amount, bool successful);
    event AuctionCreated(bytes32 indexed auctionId, address token, uint64 startTime, uint64 endTime);
    event AuctionCanceled(bytes32 indexed auctionId);
    event RegistryUpdated(address oldRegistry, address newRegistry);
    event RefundWithdrawn(bytes32 indexed auctionId, address bidder, uint256 amount);
    event ProceedsSwept(bytes32 indexed auctionId, address to, uint256 amount);

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

    function createAuction(
        bytes32 auctionId,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint64 extensionWindow,
        uint64 extensionSeconds
    ) external onlyRegistry {
        Auction storage a = auctions[auctionId];
        if (a.active || a.closed || a.canceled || a.highestBid != 0 || a.highestBidder != address(0)) {
            revert AuctionAlreadyExists();
        }
        if (endTime <= startTime) revert InvalidTimes();

        a.token = token;
        a.startTime = startTime;
        a.endTime = endTime;
        a.reservePrice = reservePrice;
        a.minBidIncrement = minBidIncrement;
        a.extensionWindow = extensionWindow;
        a.extensionSeconds = extensionSeconds;
        a.active = true;

        emit AuctionCreated(auctionId, token, startTime, endTime);
    }

    function placeBid(bytes32 auctionId, address bidder, uint256 amount) external payable onlyRegistry nonReentrant returns (uint64 newEndTime) {
        Auction storage a = auctions[auctionId];
        if (!a.active || a.closed) {
            if (a.highestBid == 0 && a.highestBidder == address(0) && !a.canceled) revert AuctionNotActive();
            revert AuctionAlreadyClosed();
        }
        if (a.canceled) revert AuctionIsCanceled();

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < a.startTime || nowTs >= a.endTime) revert AuctionNotActive();

        uint256 requiredBid = a.highestBid == 0 ? a.reservePrice : (a.highestBid + a.minBidIncrement);
        if (amount < requiredBid) revert LowBid();

        if (a.token == address(0)) {
            if (msg.value != amount) revert InvalidValue();
        } else {
            if (msg.value != 0) revert InvalidValue();
            IERC20(a.token).safeTransferFrom(bidder, address(this), amount);
        }

        if (a.highestBid > 0) {
            pendingReturns[auctionId][a.highestBidder] += a.highestBid;
        }

        a.highestBidder = bidder;
        a.highestBid = amount;

        if (a.extensionSeconds > 0 && a.extensionWindow > 0) {
            uint64 timeLeft = a.endTime > nowTs ? (a.endTime - nowTs) : 0;
            if (timeLeft <= a.extensionWindow) {
                a.endTime = a.endTime + a.extensionSeconds;
            }
        }

        newEndTime = a.endTime;
        emit BidPlaced(auctionId, bidder, amount, a.endTime);
    }

    function closeAuction(bytes32 auctionId) external onlyRegistry {
        Auction storage a = auctions[auctionId];
        if (a.highestBid == 0 && a.highestBidder == address(0) && !a.active && !a.closed && !a.canceled) revert AuctionNotFound();
        if (!a.active || a.closed) revert AuctionAlreadyClosed();
        if (a.canceled) revert AuctionIsCanceled();
        if (uint64(block.timestamp) < a.endTime) revert AuctionNotEnded();

        a.active = false;
        a.closed = true;

        bool successful = a.highestBidder != address(0) && a.highestBid >= a.reservePrice;
        if (successful) {
            a.winner = a.highestBidder;
            a.winningBid = a.highestBid;
        } else {
            if (a.highestBid > 0) {
                pendingReturns[auctionId][a.highestBidder] += a.highestBid;
            }
            a.highestBidder = address(0);
            a.highestBid = 0;
        }

        emit AuctionClosed(auctionId, a.winner, a.winningBid, successful);
    }

    function cancelAuction(bytes32 auctionId) external onlyRegistry {
        Auction storage a = auctions[auctionId];
        if (a.highestBid == 0 && a.highestBidder == address(0) && !a.active && !a.closed && !a.canceled) revert AuctionNotFound();
        if (a.closed) revert AuctionAlreadyClosed();
        if (a.canceled) revert AuctionIsCanceled();

        a.active = false;
        a.canceled = true;

        if (a.highestBid > 0 && a.highestBidder != address(0)) {
            pendingReturns[auctionId][a.highestBidder] += a.highestBid;
            a.highestBidder = address(0);
            a.highestBid = 0;
        }

        emit AuctionCanceled(auctionId);
    }

    function refundAvailable(bytes32 auctionId, address bidder) external view returns (uint256) {
        return pendingReturns[auctionId][bidder];
    }

    function withdrawRefund(bytes32 auctionId, address bidder) external onlyRegistry nonReentrant returns (uint256 amount) {
        amount = pendingReturns[auctionId][bidder];
        if (amount == 0) revert NothingToWithdraw();
        pendingReturns[auctionId][bidder] = 0;

        address token = auctions[auctionId].token;
        if (token == address(0)) {
            (bool ok, ) = payable(bidder).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(bidder, amount);
        }

        emit RefundWithdrawn(auctionId, bidder, amount);
    }

    function sweepWinningBid(bytes32 auctionId, address to) external onlyRegistry nonReentrant returns (uint256 amount, address token) {
        Auction storage a = auctions[auctionId];
        if (!a.closed) revert AuctionNotActive();
        if (a.canceled) revert AuctionIsCanceled();
        if (a.proceedsClaimed) revert ProceedsAlreadyClaimed();
        if (a.winner == address(0) || a.winningBid == 0) {
            amount = 0;
            token = a.token;
            a.proceedsClaimed = true;
            return (amount, token);
        }

        a.proceedsClaimed = true;
        amount = a.winningBid;
        token = a.token;

        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }

        emit ProceedsSwept(auctionId, to, amount);
    }

    function getOutcome(bytes32 auctionId)
        external
        view
        returns (
            address winner,
            uint256 winningBid,
            address token,
            bool closed,
            bool canceled,
            bool proceedsClaimed
        )
    {
        Auction storage a = auctions[auctionId];
        return (a.winner, a.winningBid, a.token, a.closed, a.canceled, a.proceedsClaimed);
    }
}
