// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract RaffleModule {
    error RaffleAlreadyExists();
    error RaffleNotFound();
    error RaffleAlreadyClosed();
    error InvalidTarget();
    error ZeroPurchase();

    struct Raffle {
        uint256 target;
        uint256 raised;
        bool closed;
    }

    mapping(bytes32 => Raffle) public raffles;

    event TicketPurchased(bytes32 indexed raffleId, address buyer, uint256 amount);
    event RaffleClosed(bytes32 indexed raffleId);
    event RaffleCreated(bytes32 indexed raffleId, uint256 target);

    function createRaffle(bytes32 raffleId, uint256 target) external {
        Raffle storage r = raffles[raffleId];
        if (r.target != 0 || r.raised != 0 || r.closed) revert RaffleAlreadyExists();
        if (target == 0) revert InvalidTarget();

        r.target = target;
        emit RaffleCreated(raffleId, target);
    }

    function buyTicket(bytes32 raffleId) external payable {
        Raffle storage r = raffles[raffleId];
        if (r.target == 0) revert RaffleNotFound();
        if (r.closed) revert RaffleAlreadyClosed();
        if (msg.value == 0) revert ZeroPurchase();

        r.raised += msg.value;
        emit TicketPurchased(raffleId, msg.sender, msg.value);

        if (r.raised >= r.target) {
            r.closed = true;
            emit RaffleClosed(raffleId);
        }
    }
}
