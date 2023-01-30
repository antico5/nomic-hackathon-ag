// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

uint constant ALIVE = 1;
uint constant DEATH_CLAIMED = 2;
uint constant DEAD = 3;

contract HeirWallet is Ownable {
    uint public status;

    mapping(address => bool) public heirs;

    uint public lastOwnerCall;

    uint public claimStarted;

    mapping(address => mapping(address => bool)) heirsWithdrawn;

    mapping(address => uint) originalAssetBalance;

    uint public immutable inactivityThreshold;
    uint public immutable vetoThreshold;

    constructor(uint _inactivityThreshold, uint _vetoThreshold) {
        inactivityThreshold = _inactivityThreshold;
        vetoThreshold = _vetoThreshold;
    }

    function call(
        address _dest,
        uint _value,
        bytes memory data
    ) public onlyOwner {}
}
