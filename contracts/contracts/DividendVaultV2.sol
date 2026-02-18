// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DividendVaultV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PRECISION = 1e18;

    address public controller;
    address public bondManager;
    address public tranchingEngine;

    // (classId, nonceId, token) => accumulated dividend per bond
    // token = address(0) means BNB
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public accDividendPerBond;

    // (classId, nonceId, token) => total deposited
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public totalDeposited;

    // holder => classId => nonceId => token => dividend debt
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => uint256)))) private _dividendDebt;

    // holder => classId => nonceId => token => pending rewards
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => uint256)))) private _pendingRewards;

    // Track which tokens have been deposited per (classId, nonceId) for claimAll
    mapping(uint256 => mapping(uint256 => address[])) private _depositedTokens;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _isDepositedToken;

    // Events
    event DividendDeposited(uint256 indexed classId, uint256 indexed nonceId, address indexed token, uint256 amount, uint256 accPerBond);
    event DividendClaimed(address indexed holder, uint256 indexed classId, uint256 indexed nonceId, address token, uint256 amount);
    event WaterfallDistributed(uint256 seniorClassId, uint256 juniorClassId, uint256 seniorAmount, uint256 juniorAmount);
    event ControllerSet(address indexed controller);
    event BondManagerSet(address indexed bondManager);
    event TranchingEngineSet(address indexed tranchingEngine);

    // Modifiers
    modifier onlyController() {
        require(msg.sender == controller, "DividendVaultV2: not controller");
        _;
    }

    modifier onlyControllerOrBondManager() {
        require(msg.sender == controller || msg.sender == bondManager, "DividendVaultV2: unauthorized");
        _;
    }

    constructor() Ownable(msg.sender) {}

    // --- BNB Deposit ---
    function depositBNB(uint256 classId, uint256 nonceId) external payable onlyController {
        require(msg.value > 0, "DividendVaultV2: zero deposit");
        _deposit(classId, nonceId, address(0), msg.value);
    }

    // --- ERC20 Deposit ---
    function depositERC20(uint256 classId, uint256 nonceId, address token, uint256 amount) external onlyController {
        require(token != address(0), "DividendVaultV2: use depositBNB for native");
        require(amount > 0, "DividendVaultV2: zero deposit");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _deposit(classId, nonceId, token, amount);
    }

    function _deposit(uint256 classId, uint256 nonceId, address token, uint256 amount) internal {
        uint256 supply = _getTotalSupply(classId, nonceId);
        require(supply > 0, "DividendVaultV2: zero supply");

        uint256 increment = (amount * PRECISION) / supply;
        require(increment > 0, "DividendVaultV2: deposit too small");

        accDividendPerBond[classId][nonceId][token] += increment;
        totalDeposited[classId][nonceId][token] += amount;

        // Track token for claimAll
        if (!_isDepositedToken[classId][nonceId][token]) {
            _isDepositedToken[classId][nonceId][token] = true;
            _depositedTokens[classId][nonceId].push(token);
        }

        emit DividendDeposited(classId, nonceId, token, amount, accDividendPerBond[classId][nonceId][token]);
    }

    // --- Waterfall Distribution ---
    function depositWaterfallBNB(
        uint256 seniorClassId, uint256 seniorNonceId,
        uint256 juniorClassId, uint256 juniorNonceId,
        uint256 seniorEntitlement
    ) external payable onlyController {
        require(msg.value > 0, "DividendVaultV2: zero deposit");
        _distributeWaterfall(seniorClassId, seniorNonceId, juniorClassId, juniorNonceId, address(0), msg.value, seniorEntitlement);
    }

    function depositWaterfallERC20(
        uint256 seniorClassId, uint256 seniorNonceId,
        uint256 juniorClassId, uint256 juniorNonceId,
        address token, uint256 totalAmount, uint256 seniorEntitlement
    ) external onlyController {
        require(token != address(0), "DividendVaultV2: use BNB variant");
        require(totalAmount > 0, "DividendVaultV2: zero deposit");
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);
        _distributeWaterfall(seniorClassId, seniorNonceId, juniorClassId, juniorNonceId, token, totalAmount, seniorEntitlement);
    }

    function _distributeWaterfall(
        uint256 seniorClassId, uint256 seniorNonceId,
        uint256 juniorClassId, uint256 juniorNonceId,
        address token, uint256 totalAmount, uint256 seniorEntitlement
    ) internal {
        uint256 seniorAmount;
        uint256 juniorAmount;

        if (totalAmount >= seniorEntitlement) {
            seniorAmount = seniorEntitlement;
            juniorAmount = totalAmount - seniorEntitlement;
        } else {
            seniorAmount = totalAmount;
            juniorAmount = 0;
        }

        if (seniorAmount > 0) {
            _deposit(seniorClassId, seniorNonceId, token, seniorAmount);
        }
        if (juniorAmount > 0) {
            _deposit(juniorClassId, juniorNonceId, token, juniorAmount);
        }

        emit WaterfallDistributed(seniorClassId, juniorClassId, seniorAmount, juniorAmount);
    }

    // --- Claim ---
    function claim(uint256 classId, uint256 nonceId, address token) external nonReentrant {
        uint256 payable_ = _calculateAndUpdateClaim(msg.sender, classId, nonceId, token);
        require(payable_ > 0, "DividendVaultV2: nothing to claim");

        if (token == address(0)) {
            (bool sent, ) = payable(msg.sender).call{value: payable_}("");
            require(sent, "DividendVaultV2: BNB transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, payable_);
        }

        emit DividendClaimed(msg.sender, classId, nonceId, token, payable_);
    }

    function claimAll(uint256 classId, uint256 nonceId) external nonReentrant {
        address[] memory tokens = _depositedTokens[classId][nonceId];
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 payable_ = _calculateAndUpdateClaim(msg.sender, classId, nonceId, tokens[i]);
            if (payable_ > 0) {
                if (tokens[i] == address(0)) {
                    (bool sent, ) = payable(msg.sender).call{value: payable_}("");
                    require(sent, "DividendVaultV2: BNB transfer failed");
                } else {
                    IERC20(tokens[i]).safeTransfer(msg.sender, payable_);
                }
                emit DividendClaimed(msg.sender, classId, nonceId, tokens[i], payable_);
            }
        }
    }

    function _calculateAndUpdateClaim(address holder, uint256 classId, uint256 nonceId, address token) internal returns (uint256) {
        uint256 balance = _getBalance(holder, classId, nonceId);
        uint256 accPerBond = accDividendPerBond[classId][nonceId][token];
        uint256 accumulated = (balance * accPerBond) / PRECISION;
        uint256 debt = _dividendDebt[holder][classId][nonceId][token];
        uint256 pending = _pendingRewards[holder][classId][nonceId][token];

        uint256 payable_ = (accumulated >= debt) ? (accumulated - debt + pending) : pending;

        _pendingRewards[holder][classId][nonceId][token] = 0;
        _dividendDebt[holder][classId][nonceId][token] = accumulated;

        return payable_;
    }

    // --- Transfer Hook ---
    function updateOnTransfer(
        address from, address to, uint256 classId, uint256 nonceId, uint256 amount
    ) external onlyControllerOrBondManager {
        require(amount > 0, "DividendVaultV2: zero amount");

        address[] memory tokens = _depositedTokens[classId][nonceId];
        for (uint256 i = 0; i < tokens.length; i++) {
            _updateOnTransferForToken(from, to, classId, nonceId, amount, tokens[i]);
        }
    }

    function _updateOnTransferForToken(
        address from, address to, uint256 classId, uint256 nonceId, uint256 amount, address token
    ) internal {
        uint256 accPerBond = accDividendPerBond[classId][nonceId][token];

        if (from != address(0)) {
            uint256 fromBalance = _getBalance(from, classId, nonceId);
            uint256 fromAccumulated = (fromBalance * accPerBond) / PRECISION;
            uint256 fromDebt = _dividendDebt[from][classId][nonceId][token];
            if (fromAccumulated >= fromDebt) {
                _pendingRewards[from][classId][nonceId][token] += (fromAccumulated - fromDebt);
            }
            _dividendDebt[from][classId][nonceId][token] = ((fromBalance - amount) * accPerBond) / PRECISION;
        }

        if (to != address(0)) {
            uint256 toBalance = _getBalance(to, classId, nonceId);
            uint256 toAccumulated = (toBalance * accPerBond) / PRECISION;
            uint256 toDebt = _dividendDebt[to][classId][nonceId][token];
            if (toAccumulated >= toDebt) {
                _pendingRewards[to][classId][nonceId][token] += (toAccumulated - toDebt);
            }
            _dividendDebt[to][classId][nonceId][token] = ((toBalance + amount) * accPerBond) / PRECISION;
        }
    }

    // --- View Functions ---
    function claimable(address holder, uint256 classId, uint256 nonceId, address token) external view returns (uint256) {
        uint256 balance = _getBalance(holder, classId, nonceId);
        uint256 accPerBond = accDividendPerBond[classId][nonceId][token];
        uint256 accumulated = (balance * accPerBond) / PRECISION;
        uint256 debt = _dividendDebt[holder][classId][nonceId][token];
        uint256 pending = _pendingRewards[holder][classId][nonceId][token];
        return (accumulated >= debt) ? (accumulated - debt + pending) : pending;
    }

    function getDepositedTokens(uint256 classId, uint256 nonceId) external view returns (address[] memory) {
        return _depositedTokens[classId][nonceId];
    }

    // --- Admin ---
    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "DividendVaultV2: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }

    function setBondManager(address _bondManager) external onlyOwner {
        require(_bondManager != address(0), "DividendVaultV2: zero address");
        bondManager = _bondManager;
        emit BondManagerSet(_bondManager);
    }

    function setTranchingEngine(address _tranchingEngine) external onlyOwner {
        require(_tranchingEngine != address(0), "DividendVaultV2: zero address");
        tranchingEngine = _tranchingEngine;
        emit TranchingEngineSet(_tranchingEngine);
    }

    // --- Internal Helpers ---
    function _getBalance(address holder, uint256 classId, uint256 nonceId) internal view returns (uint256) {
        (bool s, bytes memory d) = bondManager.staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256,uint256)", holder, classId, nonceId)
        );
        require(s, "DividendVaultV2: balanceOf failed");
        return abi.decode(d, (uint256));
    }

    function _getTotalSupply(uint256 classId, uint256 nonceId) internal view returns (uint256) {
        (bool s, bytes memory d) = bondManager.staticcall(
            abi.encodeWithSignature("totalSupply(uint256,uint256)", classId, nonceId)
        );
        require(s, "DividendVaultV2: totalSupply failed");
        return abi.decode(d, (uint256));
    }

    receive() external payable {}
}
