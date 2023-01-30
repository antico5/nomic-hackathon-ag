// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

uint constant ALIVE = 1;
uint constant DEATH_CLAIMED = 2;
uint constant DEAD = 3;

address constant ETHER = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

contract HeirWallet is Ownable {
    uint public status;

    mapping(address => bool) public heirs;

    uint public lastOwnerCall;

    uint public claimStarted;

    mapping(address => mapping(address => bool)) public heirsWithdrawn; // heir => asset => bool

    mapping(address => uint) public originalAssetBalance;

    uint public immutable inactivityThreshold;
    uint public immutable vetoThreshold;

    uint public heirCount;

    constructor(uint _inactivityThreshold, uint _vetoThreshold) {
        inactivityThreshold = _inactivityThreshold;
        vetoThreshold = _vetoThreshold;
    }

    function call(
        address _dest,
        uint _value,
        bytes memory _data
    ) public onlyOwner {
        (bool success, ) = _dest.call{value: _value}(_data);
        require(success, "call failed");
    }

    modifier onlyHeir() {
        require(heirs[msg.sender], "caller is not heir");
        _;
    }

    function distributeEther() external onlyHeir {
        require(status == DEAD, "wallet is not dead");
        require(!heirsWithdrawn[msg.sender][ETHER], "you already withdrew eth");

        _ensureBalanceInitialized(ETHER);

        heirsWithdrawn[msg.sender][ETHER] = true;
        payable(msg.sender).transfer(originalAssetBalance[ETHER] / heirCount);
    }

    function distributeToken(address token) external onlyHeir {
        require(status == DEAD, "wallet is not dead");
        require(
            !heirsWithdrawn[msg.sender][token],
            "you already withdrew this token"
        );

        _ensureBalanceInitialized(token);

        heirsWithdrawn[msg.sender][token] = true;
        IERC20(token).transfer(
            msg.sender,
            originalAssetBalance[token] / heirCount
        );
    }

    function _ensureBalanceInitialized(address token) private {
        if (originalAssetBalance[token] != 0) {
            return;
        }

        if (token == ETHER) {
            originalAssetBalance[token] = address(this).balance;
        } else {
            originalAssetBalance[token] = IERC20(token).balanceOf(
                address(this)
            );
        }
    }

    /// For the owner to add an heir
    function addHeir(address a) public onlyOwner {
        heirs[a] = true;
        heirCount = heirCount + 1;
    }

    /// For the owner to remove an heir
    function removeHeir(address a) public onlyOwner {
        heirs[a] = false;
        heirCount = heirCount - 1;
    }

    /// For an heir to claim that the owner has died
    function initiateClaim() public onlyHeir {
        require(status == ALIVE);
        require(lastOwnerCall + inactivityThreshold < block.timestamp);
        status = DEATH_CLAIMED;
        claimStarted = block.timestamp;
    }

    /// For an heir to assert that a claim of death has gone undisputed
    function finalizeClaim() public onlyHeir {
        require(status == DEATH_CLAIMED);
        require(claimStarted + vetoThreshold < block.timestamp);
        status = DEAD;
    }

    /// For an owner or heir to veto a claim of death
    function vetoClaim() public {
        require(heirs[msg.sender] == true || msg.sender == owner());
        require(status == DEATH_CLAIMED);
        status = ALIVE;
    }

    receive() external payable {}
}
