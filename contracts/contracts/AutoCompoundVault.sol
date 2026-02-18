// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC3475.sol";

interface IACBondManager {
    function balanceOf(address, uint256, uint256) external view returns (uint256);
    function transferFrom(address, address, IERC3475.Transaction[] calldata) external;
    function setApprovalFor(address, bool) external;
}

interface IACDividendVault {
    function claim(uint256 classId, uint256 nonceId, address token) external;
    function claimable(address holder, uint256 classId, uint256 nonceId, address token) external view returns (uint256);
}

interface IACController {
    function purchaseBondsBNB(uint256 classId, uint256 amount) external payable;
}

contract AutoCompoundVault is Ownable, ReentrancyGuard {
    IACBondManager public bondManager;
    IACDividendVault public dividendVault;
    IACController public controller;

    // user => classId => nonceId => deposited bond amount
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public deposits;
    // classId => nonceId => total deposited
    mapping(uint256 => mapping(uint256 => uint256)) public totalDeposits;

    event Deposited(address indexed user, uint256 classId, uint256 nonceId, uint256 amount);
    event Withdrawn(address indexed user, uint256 classId, uint256 nonceId, uint256 amount);
    event Compounded(uint256 indexed classId, uint256 indexed nonceId, uint256 dividendsClaimed, uint256 bondsPurchased);

    constructor(address _bondManager, address _dividendVault, address _controller) Ownable(msg.sender) {
        require(_bondManager != address(0) && _dividendVault != address(0) && _controller != address(0), "ACV: zero address");
        bondManager = IACBondManager(_bondManager);
        dividendVault = IACDividendVault(_dividendVault);
        controller = IACController(_controller);
    }

    function deposit(uint256 classId, uint256 nonceId, uint256 amount) external nonReentrant {
        require(amount > 0, "ACV: zero amount");

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        bondManager.transferFrom(msg.sender, address(this), txns);

        deposits[msg.sender][classId][nonceId] += amount;
        totalDeposits[classId][nonceId] += amount;

        emit Deposited(msg.sender, classId, nonceId, amount);
    }

    function withdraw(uint256 classId, uint256 nonceId, uint256 amount) external nonReentrant {
        require(amount > 0, "ACV: zero amount");
        require(deposits[msg.sender][classId][nonceId] >= amount, "ACV: insufficient deposit");

        deposits[msg.sender][classId][nonceId] -= amount;
        totalDeposits[classId][nonceId] -= amount;

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        bondManager.transferFrom(address(this), msg.sender, txns);

        emit Withdrawn(msg.sender, classId, nonceId, amount);
    }

    // Compound: claim dividends and buy more bonds (BNB only for simplicity)
    function compound(uint256 classId, uint256 nonceId, uint256 pricePerBond) external nonReentrant {
        uint256 claimableAmount = dividendVault.claimable(address(this), classId, nonceId, address(0));
        require(claimableAmount > 0, "ACV: nothing to compound");

        // Claim dividends
        dividendVault.claim(classId, nonceId, address(0));

        // Calculate how many bonds we can buy
        uint256 bondsToBuy = claimableAmount / pricePerBond;
        if (bondsToBuy == 0) return;

        uint256 cost = bondsToBuy * pricePerBond;

        // Purchase bonds via controller
        controller.purchaseBondsBNB{value: cost}(classId, bondsToBuy);

        // Update total deposits (new bonds belong to vault collectively)
        totalDeposits[classId][nonceId] += bondsToBuy;

        emit Compounded(classId, nonceId, claimableAmount, bondsToBuy);
    }

    function balanceOf(address user, uint256 classId, uint256 nonceId) external view returns (uint256) {
        return deposits[user][classId][nonceId];
    }

    receive() external payable {}
}
