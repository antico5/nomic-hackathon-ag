// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

uint constant ALIVE = 1;

contract HeirWallet {
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
}
