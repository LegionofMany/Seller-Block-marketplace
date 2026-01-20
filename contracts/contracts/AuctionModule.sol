// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AuctionModule is ReentrancyGuard {
    error AuctionAlreadyExists();
    error AuctionNotFound();
    error AuctionAlreadyClosed();
    error AuctionNotActive();
    error LowBid();

    struct Auction {
        address highestBidder;
        uint256 highestBid;
        bool active;
    }

    mapping(bytes32 => Auction) public auctions;

    event BidPlaced(bytes32 indexed auctionId, address bidder, uint256 amount);
    event AuctionClosed(bytes32 indexed auctionId, address winner);
    event AuctionCreated(bytes32 indexed auctionId);

    function createAuction(bytes32 auctionId) external {
        Auction storage a = auctions[auctionId];
        if (a.active || a.highestBid != 0 || a.highestBidder != address(0)) revert AuctionAlreadyExists();

        a.active = true;
        emit AuctionCreated(auctionId);
    }

    function placeBid(bytes32 auctionId) external payable nonReentrant {
        Auction storage a = auctions[auctionId];
        if (!a.active) {
            // If never created, also reports as not active; tests will cover "cannot bid after close".
            if (a.highestBid == 0 && a.highestBidder == address(0)) revert AuctionNotActive();
            revert AuctionAlreadyClosed();
        }
        if (msg.value <= a.highestBid) revert LowBid();

        if (a.highestBid > 0) {
            (bool ok, ) = payable(a.highestBidder).call{value: a.highestBid}("");
            require(ok, "REFUND_FAILED");
        }

        a.highestBidder = msg.sender;
        a.highestBid = msg.value;

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    function closeAuction(bytes32 auctionId) external {
        Auction storage a = auctions[auctionId];
        if (a.highestBid == 0 && a.highestBidder == address(0) && !a.active) revert AuctionNotFound();
        if (!a.active) revert AuctionAlreadyClosed();
        a.active = false;
        emit AuctionClosed(auctionId, a.highestBidder);
    }
}
