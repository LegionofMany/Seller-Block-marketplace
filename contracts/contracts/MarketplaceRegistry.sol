// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./EscrowVault.sol";

interface IAuctionModule {
    function createAuction(
        bytes32 auctionId,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint64 extensionWindow,
        uint64 extensionSeconds
    ) external;

    function placeBid(bytes32 auctionId, address bidder, uint256 amount) external payable returns (uint64 newEndTime);
    function closeAuction(bytes32 auctionId) external;
    function cancelAuction(bytes32 auctionId) external;
    function sweepWinningBid(bytes32 auctionId, address to) external returns (uint256 amount, address token);
    function withdrawRefund(bytes32 auctionId, address bidder) external returns (uint256 amount);
    function getOutcome(bytes32 auctionId) external view returns (address winner, uint256 winningBid, address token, bool closed, bool canceled, bool proceedsClaimed);
}

interface IRaffleModule {
    function createRaffle(
        bytes32 raffleId,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint256 ticketPrice,
        uint256 targetAmount,
        uint32 minParticipants
    ) external;

    function enterRaffle(bytes32 raffleId, address buyer, uint32 ticketCount) external payable;
    function closeRaffle(bytes32 raffleId, uint256 randomSeed) external returns (bool successful, address winner, uint256 raised, address token);
    function cancelRaffle(bytes32 raffleId) external;
    function sweepProceeds(bytes32 raffleId, address to) external returns (uint256 amount, address token);
    function withdrawRefund(bytes32 raffleId, address buyer) external returns (uint256 amount);
    function quoteEntry(bytes32 raffleId, uint32 ticketCount) external view returns (uint256 amount);
}

contract MarketplaceRegistry is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ListingAlreadyExists();
    error ListingNotFound();
    error InvalidListingId();
    error NotSeller();
    error ZeroAddress();
    error NotBuyer();
    error InvalidSaleType();
    error InvalidStatus();
    error InvalidTimes();
    error InvalidAmount();
    error NotArbiter();
    error ModuleNotOpened();
    error ListingNotActive();
    error ListingNotSellable();
    error AuctionNotEnded();
    error RaffleNotEnded();
    error CommitmentMismatch();

    enum SaleType {
        FixedPrice,
        Auction,
        Raffle
    }

    enum ListingStatus {
        None,
        Active,
        Cancelled,
        Expired,
        PendingDelivery,
        Completed,
        Refunded
    }

    struct Listing {
        address seller;
        address buyer;
        SaleType saleType;
        ListingStatus status;
        string metadataURI;
        uint256 price;
        address token; // address(0) = native ETH
        bytes32 moduleId;
        bytes32 escrowId;
        uint64 startTime;
        uint64 endTime;
        bytes32 raffleCommit;
    }

    EscrowVault public escrowVault;
    IAuctionModule public auctionModule;
    IRaffleModule public raffleModule;

    uint16 public protocolFeeBps;
    address public feeRecipient;
    address public arbiter;
    uint256 public listingNonce;

    mapping(address => bytes32) private lastListingIdBySeller;

    mapping(bytes32 => Listing) public listings;

    event ListingCreated(bytes32 indexed id, address seller, SaleType saleType, address token, uint256 price, string metadataURI);
    event ListingCancelled(bytes32 indexed id);
    event AuctionOpened(bytes32 indexed listingId, bytes32 indexed auctionId);
    event BidPlaced(bytes32 indexed listingId, bytes32 indexed auctionId, address bidder, uint256 amount);
    event AuctionClosed(bytes32 indexed listingId, bytes32 indexed auctionId, address winner, uint256 amount, bool successful);
    event RaffleOpened(bytes32 indexed listingId, bytes32 indexed raffleId);
    event RaffleEntered(bytes32 indexed listingId, bytes32 indexed raffleId, address buyer, uint256 tickets, uint256 amount);
    event WinnerSelected(bytes32 indexed listingId, bytes32 indexed raffleId, address winner, uint256 raised);
    event EscrowCreated(bytes32 indexed listingId, bytes32 indexed escrowId, address buyer, address seller, address token, uint256 amount);
    event EscrowReleased(bytes32 indexed listingId, bytes32 indexed escrowId);
    event ProtocolFeePaid(bytes32 indexed listingId, bytes32 indexed escrowId, address recipient, address token, uint256 amount);
    event ListingCompleted(bytes32 indexed listingId);
    event ListingRefunded(bytes32 indexed listingId);
    event ProtocolFeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event ArbiterUpdated(address oldArbiter, address newArbiter);

    /// @notice Convenience helper for UIs/Remix: returns the latest listingId created by a seller.
    function lastListingIdOf(address seller) external view returns (bytes32) {
        return lastListingIdBySeller[seller];
    }

    /// @notice Deterministically computes a listingId the same way `createListing` does.
    /// @dev Useful if you know the seller address and the listing nonce.
    function computeListingId(uint256 nonce, address seller) external view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce, seller));
    }

    constructor(
        address owner_,
        EscrowVault vault,
        IAuctionModule auction,
        IRaffleModule raffle,
        address feeRecipient_
    ) Ownable(owner_) {
        if (address(vault) == address(0)) revert ZeroAddress();
        if (address(auction) == address(0)) revert ZeroAddress();
        if (address(raffle) == address(0)) revert ZeroAddress();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        escrowVault = vault;
        auctionModule = auction;
        raffleModule = raffle;
        feeRecipient = feeRecipient_;
        protocolFeeBps = 250; // 2.5% default
    }

    receive() external payable {}

    fallback() external payable {}

    modifier onlySeller(bytes32 listingId) {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (msg.sender != l.seller) revert NotSeller();
        _;
    }

    modifier onlyBuyer(bytes32 listingId) {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (msg.sender != l.buyer) revert NotBuyer();
        _;
    }

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
        // guardrail: max 10%
        if (newFeeBps > 1000) revert InvalidAmount();
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

    function createListing(
        string calldata metadataURI,
        uint256 price,
        address token,
        SaleType saleType
    ) external whenNotPaused returns (bytes32 listingId) {
        if (bytes(metadataURI).length == 0) revert InvalidListingId();
        if (saleType != SaleType.FixedPrice && saleType != SaleType.Auction && saleType != SaleType.Raffle) revert InvalidSaleType();
        if (saleType == SaleType.FixedPrice && price == 0) revert InvalidAmount();

        listingNonce += 1;
        listingId = keccak256(abi.encodePacked(address(this), listingNonce, msg.sender));
        if (listings[listingId].seller != address(0)) revert ListingAlreadyExists();

        listings[listingId] = Listing({
            seller: msg.sender,
            buyer: address(0),
            saleType: saleType,
            status: ListingStatus.Active,
            metadataURI: metadataURI,
            price: price,
            token: token,
            moduleId: bytes32(0),
            escrowId: bytes32(0),
            startTime: uint64(block.timestamp),
            endTime: 0,
            raffleCommit: bytes32(0)
        });

        lastListingIdBySeller[msg.sender] = listingId;

        emit ListingCreated(listingId, msg.sender, saleType, token, price, metadataURI);
    }

    function cancelListing(bytes32 listingId) external whenNotPaused onlySeller(listingId) {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert InvalidStatus();

        l.status = ListingStatus.Cancelled;

        if (l.saleType == SaleType.Auction && l.moduleId != bytes32(0)) {
            auctionModule.cancelAuction(l.moduleId);
        }
        if (l.saleType == SaleType.Raffle && l.moduleId != bytes32(0)) {
            raffleModule.cancelRaffle(l.moduleId);
        }

        emit ListingCancelled(listingId);
    }

    function openAuction(
        bytes32 listingId,
        uint64 startTime,
        uint64 endTime,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint64 extensionWindow,
        uint64 extensionSeconds
    ) external whenNotPaused onlySeller(listingId) {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert InvalidStatus();
        if (l.saleType != SaleType.Auction) revert InvalidSaleType();
        if (l.moduleId != bytes32(0)) revert ListingAlreadyExists();
        if (endTime <= startTime) revert InvalidTimes();

        bytes32 auctionId = keccak256(abi.encodePacked("AUCTION", listingId));
        l.moduleId = auctionId;
        l.startTime = startTime;
        l.endTime = endTime;

        auctionModule.createAuction(
            auctionId,
            l.token,
            startTime,
            endTime,
            reservePrice,
            minBidIncrement,
            extensionWindow,
            extensionSeconds
        );

        emit AuctionOpened(listingId, auctionId);
    }

    function bid(bytes32 listingId, uint256 amount) external payable whenNotPaused nonReentrant {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        if (l.saleType != SaleType.Auction) revert InvalidSaleType();
        if (l.moduleId == bytes32(0)) revert ModuleNotOpened();

        if (l.token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
            auctionModule.placeBid{value: amount}(l.moduleId, msg.sender, amount);
        } else {
            if (msg.value != 0) revert InvalidAmount();
            auctionModule.placeBid(l.moduleId, msg.sender, amount);
        }

        emit BidPlaced(listingId, l.moduleId, msg.sender, amount);
    }

    function closeAuction(bytes32 listingId) external whenNotPaused nonReentrant {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.status != ListingStatus.Active) revert InvalidStatus();
        if (l.saleType != SaleType.Auction) revert InvalidSaleType();
        if (l.moduleId == bytes32(0)) revert ModuleNotOpened();

        auctionModule.closeAuction(l.moduleId);

        (address winner, uint256 winningBid, address token, , , ) = auctionModule.getOutcome(l.moduleId);
        (uint256 proceeds, ) = auctionModule.sweepWinningBid(l.moduleId, address(this));
        if (proceeds == 0 || winner == address(0) || winningBid == 0) {
            l.status = ListingStatus.Expired;
            emit AuctionClosed(listingId, l.moduleId, address(0), 0, false);
            return;
        }

        bytes32 escrowId = keccak256(abi.encodePacked("ESCROW", listingId, l.moduleId, block.number));
        l.escrowId = escrowId;
        l.price = proceeds;
        l.status = ListingStatus.PendingDelivery;
        l.buyer = winner;

        if (token == address(0)) {
            escrowVault.createEscrow{value: proceeds}(escrowId, address(this), winner, l.seller, address(0), proceeds);
        } else {
            IERC20(token).forceApprove(address(escrowVault), proceeds);
            escrowVault.createEscrow(escrowId, address(this), winner, l.seller, token, proceeds);
        }

        emit AuctionClosed(listingId, l.moduleId, winner, proceeds, true);
        emit EscrowCreated(listingId, escrowId, winner, l.seller, token, proceeds);
    }

    function openRaffle(
        bytes32 listingId,
        uint64 startTime,
        uint64 endTime,
        uint256 ticketPrice,
        uint256 targetAmount,
        uint32 minParticipants,
        bytes32 commit
    ) external whenNotPaused onlySeller(listingId) {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert InvalidStatus();
        if (l.saleType != SaleType.Raffle) revert InvalidSaleType();
        if (l.moduleId != bytes32(0)) revert ListingAlreadyExists();
        if (endTime <= startTime) revert InvalidTimes();
        if (commit == bytes32(0)) revert InvalidListingId();

        bytes32 raffleId = keccak256(abi.encodePacked("RAFFLE", listingId));
        l.moduleId = raffleId;
        l.startTime = startTime;
        l.endTime = endTime;
        l.raffleCommit = commit;

        raffleModule.createRaffle(raffleId, l.token, startTime, endTime, ticketPrice, targetAmount, minParticipants);
        emit RaffleOpened(listingId, raffleId);
    }

    function enterRaffle(bytes32 listingId, uint32 ticketCount) external payable whenNotPaused nonReentrant {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        if (l.saleType != SaleType.Raffle) revert InvalidSaleType();
        if (l.moduleId == bytes32(0)) revert ModuleNotOpened();

        uint256 amount = 0;
        if (l.token == address(0)) {
            // Amount is enforced inside RaffleModule via ticketPrice * ticketCount
            amount = msg.value;
            raffleModule.enterRaffle{value: msg.value}(l.moduleId, msg.sender, ticketCount);
        } else {
            if (msg.value != 0) revert InvalidAmount();
            amount = raffleModule.quoteEntry(l.moduleId, ticketCount);
            raffleModule.enterRaffle(l.moduleId, msg.sender, ticketCount);
        }

        emit RaffleEntered(listingId, l.moduleId, msg.sender, uint256(ticketCount), amount);
    }

    function closeRaffle(bytes32 listingId, bytes32 reveal) external whenNotPaused nonReentrant {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.status != ListingStatus.Active) revert InvalidStatus();
        if (l.saleType != SaleType.Raffle) revert InvalidSaleType();
        if (l.moduleId == bytes32(0)) revert ModuleNotOpened();
        if (l.raffleCommit == bytes32(0)) revert CommitmentMismatch();
        if (keccak256(abi.encodePacked(reveal)) != l.raffleCommit) revert CommitmentMismatch();

        uint256 seed = uint256(keccak256(abi.encodePacked(reveal, block.prevrandao, blockhash(block.number - 1), l.moduleId)));
        (bool successful, address winner, uint256 raised, address token) = raffleModule.closeRaffle(l.moduleId, seed);

        if (!successful) {
            l.status = ListingStatus.Expired;
            emit WinnerSelected(listingId, l.moduleId, address(0), 0);
            return;
        }

        emit WinnerSelected(listingId, l.moduleId, winner, raised);

        (uint256 proceeds, ) = raffleModule.sweepProceeds(l.moduleId, address(this));
        if (proceeds != raised) {
            // should never happen; treat as expired
            l.status = ListingStatus.Expired;
            return;
        }

        bytes32 escrowId = keccak256(abi.encodePacked("ESCROW", listingId, l.moduleId, block.number));
        l.escrowId = escrowId;
        l.buyer = winner;
        l.price = raised;
        l.status = ListingStatus.PendingDelivery;

        if (token == address(0)) {
            escrowVault.createEscrow{value: raised}(escrowId, address(this), winner, l.seller, address(0), raised);
        } else {
            IERC20(token).forceApprove(address(escrowVault), raised);
            escrowVault.createEscrow(escrowId, address(this), winner, l.seller, token, raised);
        }

        emit EscrowCreated(listingId, escrowId, winner, l.seller, token, raised);
    }

    function buy(bytes32 listingId) external payable whenNotPaused nonReentrant {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.status != ListingStatus.Active) revert ListingNotSellable();
        if (l.saleType != SaleType.FixedPrice) revert InvalidSaleType();
        if (l.price == 0) revert InvalidAmount();

        bytes32 escrowId = keccak256(abi.encodePacked("ESCROW", listingId, msg.sender, block.number));
        l.escrowId = escrowId;
        l.buyer = msg.sender;
        l.status = ListingStatus.PendingDelivery;

        if (l.token == address(0)) {
            if (msg.value != l.price) revert InvalidAmount();
            escrowVault.createEscrow{value: l.price}(escrowId, msg.sender, msg.sender, l.seller, address(0), l.price);
        } else {
            if (msg.value != 0) revert InvalidAmount();
            escrowVault.createEscrow(escrowId, msg.sender, msg.sender, l.seller, l.token, l.price);
        }

        emit EscrowCreated(listingId, escrowId, msg.sender, l.seller, l.token, l.price);
    }

    function confirmDelivery(bytes32 listingId) external whenNotPaused nonReentrant onlyBuyer(listingId) {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.PendingDelivery) revert InvalidStatus();

        (, uint256 feeAmount) = _quoteFee(l.escrowId);
        escrowVault.release(l.escrowId, feeRecipient, protocolFeeBps);
        l.status = ListingStatus.Completed;
        emit EscrowReleased(listingId, l.escrowId);

        emit ProtocolFeePaid(listingId, l.escrowId, feeRecipient, l.token, feeAmount);
        emit ListingCompleted(listingId);
    }

    function requestRefund(bytes32 listingId) external whenNotPaused nonReentrant onlyBuyer(listingId) {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.PendingDelivery) revert InvalidStatus();
        escrowVault.refund(l.escrowId);
        l.status = ListingStatus.Refunded;
        emit ListingRefunded(listingId);
    }

    function arbiterRelease(bytes32 listingId) external whenNotPaused nonReentrant onlyArbiter {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.PendingDelivery) revert InvalidStatus();

        (, uint256 feeAmount) = _quoteFee(l.escrowId);
        escrowVault.release(l.escrowId, feeRecipient, protocolFeeBps);
        l.status = ListingStatus.Completed;
        emit EscrowReleased(listingId, l.escrowId);
        emit ProtocolFeePaid(listingId, l.escrowId, feeRecipient, l.token, feeAmount);
        emit ListingCompleted(listingId);
    }

    function _quoteFee(bytes32 escrowId) internal view returns (uint256 amount, uint256 feeAmount) {
        EscrowVault.Escrow memory e = escrowVault.getEscrow(escrowId);
        amount = e.amount;
        feeAmount = (amount * uint256(protocolFeeBps)) / 10_000;
    }

    function arbiterRefund(bytes32 listingId) external whenNotPaused nonReentrant onlyArbiter {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.PendingDelivery) revert InvalidStatus();
        escrowVault.refund(l.escrowId);
        l.status = ListingStatus.Refunded;
        emit ListingRefunded(listingId);
    }

    /// @notice Withdraw ERC20/ETH credits from EscrowVault.
    function withdrawPayout(address token) external nonReentrant returns (uint256 amount) {
        return escrowVault.withdraw(token, msg.sender);
    }

    function withdrawAuctionRefund(bytes32 listingId) external nonReentrant returns (uint256 amount) {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.saleType != SaleType.Auction) revert InvalidSaleType();
        if (l.moduleId == bytes32(0)) revert ModuleNotOpened();
        return auctionModule.withdrawRefund(l.moduleId, msg.sender);
    }

    function withdrawRaffleRefund(bytes32 listingId) external nonReentrant returns (uint256 amount) {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (l.saleType != SaleType.Raffle) revert InvalidSaleType();
        if (l.moduleId == bytes32(0)) revert ModuleNotOpened();
        return raffleModule.withdrawRefund(l.moduleId, msg.sender);
    }

    function withdrawFees(address token) external onlyOwner nonReentrant returns (uint256 amount) {
        return escrowVault.withdraw(token, feeRecipient);
    }
}
