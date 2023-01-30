// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

contract MockCallableContract {
    uint public lastValue;
    bytes public lastData;

    fallback() external payable {
        lastValue = msg.value;
        lastData = msg.data;
    }
}
