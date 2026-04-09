// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract ERC20PermitMock is ERC20, ERC20Permit {
    uint8 private immutable _tokenDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialAccount,
        uint256 initialBalance
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        _tokenDecimals = decimals_;
        if (initialAccount != address(0) && initialBalance != 0) {
            _mint(initialAccount, initialBalance);
        }
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}