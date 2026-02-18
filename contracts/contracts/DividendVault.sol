// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DividendVault - Pull-over-Push Dividend Distribution
 * @notice MasterChef-style accumulator pattern for distributing BNB revenue
 *         to ERC-3475 bondholders proportionally to their holdings.
 */
contract DividendVault is Ownable, ReentrancyGuard {
    uint256 private constant PRECISION = 1e18;

    address public controller;
    address public bondManager;

    // classId => accumulated dividend per bond (scaled by PRECISION)
    mapping(uint256 => uint256) public classAccDividendPerBond;

    // classId => total deposited BNB for that class
    mapping(uint256 => uint256) public classTotalDeposited;

    // holder => classId => nonceId => dividend debt snapshot
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) private _dividendDebt;

    // holder => classId => nonceId => accumulated unclaimed rewards
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) private _pendingRewards;

    // -- Events --

    event DividendDeposited(uint256 indexed classId, uint256 amount, uint256 accPerBond);
    event DividendClaimed(address indexed holder, uint256 indexed classId, uint256 indexed nonceId, uint256 amount);
    event ControllerSet(address indexed controller);
    event BondManagerSet(address indexed bondManager);

    // -- Modifiers --

    modifier onlyController() {
        require(msg.sender == controller, "DividendVault: caller is not controller");
        _;
    }

    modifier onlyControllerOrBondManager() {
        require(
            msg.sender == controller || msg.sender == bondManager,
            "DividendVault: unauthorized"
        );
        _;
    }

    // -- Constructor --

    constructor() Ownable(msg.sender) {}

    // -- Core Functions --

    /**
     * @notice Deposit BNB revenue for a bond class and update the accumulator.
     * @dev Reads totalSupply from bondManager via staticcall. Reverts if supply is 0.
     * @param classId The bond class to distribute dividends to
     * @param nonceId The nonce to query total supply for
     */
    function deposit(uint256 classId, uint256 nonceId) external payable onlyController {
        require(msg.value > 0, "DividendVault: zero deposit");

        uint256 supply = _getTotalSupply(classId, nonceId);
        require(supply > 0, "DividendVault: zero supply");

        uint256 increment = (msg.value * PRECISION) / supply;
        require(increment > 0, "DividendVault: deposit too small for current supply");
        classAccDividendPerBond[classId] += increment;
        classTotalDeposited[classId] += msg.value;

        emit DividendDeposited(classId, msg.value, classAccDividendPerBond[classId]);
    }

    /**
     * @notice Claim pending dividends for a specific bond position.
     * @param classId The bond class
     * @param nonceId The nonce (issuance batch)
     */
    function claim(uint256 classId, uint256 nonceId) external nonReentrant {
        uint256 balance = _getBalance(msg.sender, classId, nonceId);
        uint256 accPerBond = classAccDividendPerBond[classId];

        uint256 accumulated = (balance * accPerBond) / PRECISION;
        uint256 debt = _dividendDebt[msg.sender][classId][nonceId];
        uint256 pending = _pendingRewards[msg.sender][classId][nonceId];
        uint256 payable_ = (accumulated >= debt) ? (accumulated - debt + pending) : pending;

        require(payable_ > 0, "DividendVault: nothing to claim");

        _pendingRewards[msg.sender][classId][nonceId] = 0;
        _dividendDebt[msg.sender][classId][nonceId] = accumulated;

        (bool sent, ) = payable(msg.sender).call{value: payable_}("");
        require(sent, "DividendVault: BNB transfer failed");

        emit DividendClaimed(msg.sender, classId, nonceId, payable_);
    }

    /**
     * @notice Called when bonds transfer. Snapshots pending for both parties and updates debts.
     * @param from The sender of the bonds
     * @param to The receiver of the bonds
     * @param classId The bond class
     * @param nonceId The nonce
     * @param amount Number of bonds transferred (unused in acc calc but validates > 0)
     */
    function updateOnTransfer(
        address from,
        address to,
        uint256 classId,
        uint256 nonceId,
        uint256 amount
    ) external onlyControllerOrBondManager {
        require(amount > 0, "DividendVault: zero amount");

        uint256 accPerBond = classAccDividendPerBond[classId];

        // Snapshot pending for sender (before balance changes)
        if (from != address(0)) {
            uint256 fromBalance = _getBalance(from, classId, nonceId);
            uint256 fromAccumulated = (fromBalance * accPerBond) / PRECISION;
            uint256 fromDebt = _dividendDebt[from][classId][nonceId];
            _pendingRewards[from][classId][nonceId] += (fromAccumulated - fromDebt);
            // New debt: after transfer, sender has (fromBalance - amount) bonds
            _dividendDebt[from][classId][nonceId] = ((fromBalance - amount) * accPerBond) / PRECISION;
        }

        // Snapshot pending for receiver (before balance changes)
        if (to != address(0)) {
            uint256 toBalance = _getBalance(to, classId, nonceId);
            uint256 toAccumulated = (toBalance * accPerBond) / PRECISION;
            uint256 toDebt = _dividendDebt[to][classId][nonceId];
            _pendingRewards[to][classId][nonceId] += (toAccumulated - toDebt);
            // New debt: after transfer, receiver has (toBalance + amount) bonds
            _dividendDebt[to][classId][nonceId] = ((toBalance + amount) * accPerBond) / PRECISION;
        }
    }

    // -- View Functions --

    /**
     * @notice Returns claimable dividend amount for a holder position.
     */
    function claimable(address holder, uint256 classId, uint256 nonceId) external view returns (uint256) {
        uint256 balance = _getBalance(holder, classId, nonceId);
        uint256 accPerBond = classAccDividendPerBond[classId];
        uint256 accumulated = (balance * accPerBond) / PRECISION;
        uint256 debt = _dividendDebt[holder][classId][nonceId];
        uint256 pending = _pendingRewards[holder][classId][nonceId];
        return (accumulated >= debt) ? (accumulated - debt + pending) : pending;
    }

    // -- Admin Functions --

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "DividendVault: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }

    function setBondManager(address _bondManager) external onlyOwner {
        require(_bondManager != address(0), "DividendVault: zero address");
        bondManager = _bondManager;
        emit BondManagerSet(_bondManager);
    }

    // -- Internal Helpers --

    function _getBalance(address holder, uint256 classId, uint256 nonceId) internal view returns (uint256) {
        (bool s, bytes memory d) = bondManager.staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256,uint256)", holder, classId, nonceId)
        );
        require(s, "DividendVault: balanceOf call failed");
        return abi.decode(d, (uint256));
    }

    function _getTotalSupply(uint256 classId, uint256 nonceId) internal view returns (uint256) {
        (bool s, bytes memory d) = bondManager.staticcall(
            abi.encodeWithSignature("totalSupply(uint256,uint256)", classId, nonceId)
        );
        require(s, "DividendVault: totalSupply call failed");
        return abi.decode(d, (uint256));
    }
}
