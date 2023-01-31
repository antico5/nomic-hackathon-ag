// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

uint constant ALIVE = 1;
uint constant DEATH_CLAIMED = 2;
uint constant DEAD = 3;

address constant ETHER = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

contract HeirWallet is Ownable {
    // State
    uint public status;
    mapping(address => bool) public heirs;
    uint public lastOwnerCall;
    uint public claimStarted;
    mapping(address => mapping(address => bool)) public heirsWithdrawn; // heir => asset => bool
    mapping(address => uint) public originalAssetBalance;
    uint public immutable inactivityThreshold;
    uint public immutable vetoThreshold;
    uint public heirCount;

    // Events
    event HeirAdded(address indexed heir);
    event HeirRemoved(address indexed heir);
    event ClaimInitiated(address indexed who);
    event ClaimVetoed(address indexed who);
    event ClaimFinalized(address indexed who);
    event EtherDistributed(address indexed heir, uint amount);
    event TokenDistributed(
        address indexed heir,
        address indexed token,
        uint amount
    );

    // Modifiers
    modifier updateCallTimestamp() {
        _;
        lastOwnerCall = block.timestamp;
    }

    modifier onlyHeir() {
        require(heirs[msg.sender], "caller is not heir");
        _;
    }

    // Constructor
    constructor(uint _inactivityThreshold, uint _vetoThreshold) {
        inactivityThreshold = _inactivityThreshold;
        vetoThreshold = _vetoThreshold;
        status = ALIVE;
    }

    // Functions

    /// Allows arbitrary calls, using this contract as a smart contract wallet
    /// @param _dest address to call
    /// @param _value ether value
    /// @param _data calldata
    function call(
        address _dest,
        uint _value,
        bytes memory _data
    ) public onlyOwner updateCallTimestamp {
        (bool success, ) = _dest.call{value: _value}(_data);
        require(success, "call failed");
    }

    /// For the owner to add an heir
    function addHeir(address heir) public onlyOwner {
        require(!heirs[heir], "already an heir");
        heirs[heir] = true;
        heirCount = heirCount + 1;

        emit HeirAdded(heir);
    }

    /// For the owner to remove an heir
    function removeHeir(address heir) public onlyOwner {
        require(heirs[heir], "not an heir");
        heirs[heir] = false;
        heirCount = heirCount - 1;

        emit HeirRemoved(heir);
    }

    /// For an heir to claim that the owner has died
    function initiateClaim() public onlyHeir {
        require(status == ALIVE, "wallet is not alive");
        require(
            lastOwnerCall + inactivityThreshold < block.timestamp,
            "owner has invoked call() too recently"
        );
        status = DEATH_CLAIMED;
        claimStarted = block.timestamp;

        emit ClaimInitiated(msg.sender);
    }

    /// For an heir to assert that a claim of death has gone undisputed
    function finalizeClaim() public onlyHeir {
        require(status != ALIVE, "claim has not yet been initialized");
        require(status != DEAD, "claim has already been finalized");
        require(
            claimStarted + vetoThreshold < block.timestamp,
            "claim has been initialized too recently"
        );
        status = DEAD;

        emit ClaimFinalized(msg.sender);
    }

    /// Heirs get their share of the ether
    function distributeEther() external onlyHeir {
        require(status == DEAD, "wallet is not dead");
        require(!heirsWithdrawn[msg.sender][ETHER], "you already withdrew eth");

        _ensureBalanceInitialized(ETHER);

        heirsWithdrawn[msg.sender][ETHER] = true;
        uint amount = originalAssetBalance[ETHER] / heirCount;
        payable(msg.sender).transfer(amount);

        emit EtherDistributed(msg.sender, amount);
    }

    /// Heirs get their share of a token
    /// @param token token to distribute
    function distributeToken(address token) external onlyHeir {
        require(status == DEAD, "wallet is not dead");
        require(
            !heirsWithdrawn[msg.sender][token],
            "you already withdrew this token"
        );

        _ensureBalanceInitialized(token);

        heirsWithdrawn[msg.sender][token] = true;
        uint amount = originalAssetBalance[token] / heirCount;
        IERC20(token).transfer(msg.sender, amount);

        emit TokenDistributed(msg.sender, token, amount);
    }

    /// Store the wallet's balance of a given token, only once before distribution
    /// @param token token address
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

    /// For an owner or heir to veto a claim of death
    function vetoClaim() public {
        require(
            heirs[msg.sender] == true || msg.sender == owner(),
            "no power to veto"
        );
        require(status != ALIVE, "claim has not yet been initialized");
        require(status != DEAD, "claim has already been finalized");
        status = ALIVE;

        emit ClaimVetoed(msg.sender);
    }

    receive() external payable {}
}
