// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./EscrowVault.sol";

contract MarketplaceRegistry is Ownable {
    error ListingAlreadyExists();
    error ListingNotFound();
    error InvalidListingId();
    error NotSeller();
    error ZeroAddress();

    enum SaleType {
        FixedPrice,
        Auction,
        Raffle
    }

    struct Listing {
        address seller;
        SaleType saleType;
        bool active;
    }

    EscrowVault public escrowVault;
    mapping(bytes32 => Listing) public listings;

    event ListingCreated(bytes32 indexed id, address seller, SaleType saleType);
    event ListingDeactivated(bytes32 indexed id);

    constructor(address owner_, EscrowVault vault) Ownable(owner_) {
        if (address(vault) == address(0)) revert ZeroAddress();
        escrowVault = vault;
    }

    function createListing(
        bytes32 listingId,
        SaleType saleType
    ) external {
        if (listingId == bytes32(0)) revert InvalidListingId();
        if (listings[listingId].seller != address(0)) revert ListingAlreadyExists();

        listings[listingId] = Listing({
            seller: msg.sender,
            saleType: saleType,
            active: true
        });

        emit ListingCreated(listingId, msg.sender, saleType);
    }

    function deactivateListing(bytes32 listingId) external {
        Listing storage l = listings[listingId];
        if (l.seller == address(0)) revert ListingNotFound();
        if (msg.sender != l.seller) revert NotSeller();
        l.active = false;
        emit ListingDeactivated(listingId);
    }
}
