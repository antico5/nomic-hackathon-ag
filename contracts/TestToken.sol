// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20("Test", "TST") {
    function mint(address to, uint amt) public {
        _mint(to, amt);
    }
}
