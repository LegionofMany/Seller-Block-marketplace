// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC20 mock that can attempt a re-entrant callback during transferFrom.
/// @dev The callback failure is swallowed so the transferFrom can still succeed,
///      enabling tests to assert that reentrancy was blocked.
contract ReentrantERC20 is ERC20 {
    uint8 private immutable _decimals;

    address public callbackTarget;
    bytes public callbackData;

    bool public lastCallbackSuccess;
    bytes public lastCallbackReturnData;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialAccount,
        uint256 initialBalance
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        if (initialAccount != address(0) && initialBalance != 0) {
            _mint(initialAccount, initialBalance);
        }
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function clearCallback() external {
        callbackTarget = address(0);
        delete callbackData;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        bool ok = super.transferFrom(from, to, value);

        address target = callbackTarget;
        if (target != address(0) && callbackData.length != 0) {
            (lastCallbackSuccess, lastCallbackReturnData) = target.call(callbackData);
        } else {
            lastCallbackSuccess = true;
            delete lastCallbackReturnData;
        }

        return ok;
    }
}
