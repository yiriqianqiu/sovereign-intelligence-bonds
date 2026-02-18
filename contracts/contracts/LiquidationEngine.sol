// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ILiquidationRegistry {
    function creditRatings(uint256 agentId) external view returns (uint8);
    function getAgentOwner(uint256 agentId) external view returns (address);
}

interface ILiquidationBondManager {
    function markRedeemable(uint256 classId, uint256 nonceId) external;
    function bondClasses(uint256 classId) external view returns (
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue, uint256 maxSupply, uint8 tranche, address paymentToken, bool exists
    );
}

contract LiquidationEngine is Ownable {
    struct LiquidationProcess {
        uint256 agentId;
        uint256 triggeredAt;
        uint256 gracePeriodEnd;
        bool executed;
        bool cancelled;
    }

    ILiquidationRegistry public nfaRegistry;
    ILiquidationBondManager public bondManager;
    address public controller;

    mapping(uint256 => LiquidationProcess) public liquidations;
    uint256 public gracePeriod = 7 days;

    // Track agent bond classes for liquidation
    mapping(uint256 => uint256[]) public agentClassIds;
    mapping(uint256 => uint256[]) public classNonceIds;

    event LiquidationTriggered(uint256 indexed agentId, uint256 gracePeriodEnd);
    event LiquidationExecuted(uint256 indexed agentId);
    event LiquidationCancelled(uint256 indexed agentId);
    event GracePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);

    constructor(address _nfaRegistry, address _bondManager) Ownable(msg.sender) {
        require(_nfaRegistry != address(0) && _bondManager != address(0), "Liquidation: zero address");
        nfaRegistry = ILiquidationRegistry(_nfaRegistry);
        bondManager = ILiquidationBondManager(_bondManager);
    }

    // Register class/nonce for tracking (called by controller during IPO)
    function registerBondClass(uint256 agentId, uint256 classId) external {
        require(msg.sender == controller || msg.sender == owner(), "Liquidation: unauthorized");
        agentClassIds[agentId].push(classId);
    }

    function registerNonce(uint256 classId, uint256 nonceId) external {
        require(msg.sender == controller || msg.sender == owner(), "Liquidation: unauthorized");
        classNonceIds[classId].push(nonceId);
    }

    function triggerLiquidation(uint256 agentId) external {
        require(!liquidations[agentId].executed, "Liquidation: already executed");
        require(!_isActiveLiquidation(agentId), "Liquidation: already triggered");

        uint8 rating = nfaRegistry.creditRatings(agentId);
        require(rating == 1, "Liquidation: agent not rated C"); // C = 1

        uint256 end = block.timestamp + gracePeriod;
        liquidations[agentId] = LiquidationProcess({
            agentId: agentId,
            triggeredAt: block.timestamp,
            gracePeriodEnd: end,
            executed: false,
            cancelled: false
        });

        emit LiquidationTriggered(agentId, end);
    }

    function executeLiquidation(uint256 agentId) external {
        LiquidationProcess storage liq = liquidations[agentId];
        require(_isActiveLiquidation(agentId), "Liquidation: not active");
        require(block.timestamp >= liq.gracePeriodEnd, "Liquidation: grace period not ended");

        liq.executed = true;

        // Mark all bonds for this agent as redeemable
        uint256[] memory classIds = agentClassIds[agentId];
        for (uint256 i = 0; i < classIds.length; i++) {
            uint256[] memory nonceIds = classNonceIds[classIds[i]];
            for (uint256 j = 0; j < nonceIds.length; j++) {
                try bondManager.markRedeemable(classIds[i], nonceIds[j]) {} catch {}
            }
        }

        emit LiquidationExecuted(agentId);
    }

    function cancelLiquidation(uint256 agentId) external onlyOwner {
        require(_isActiveLiquidation(agentId), "Liquidation: not active");
        liquidations[agentId].cancelled = true;
        emit LiquidationCancelled(agentId);
    }

    function isUnderLiquidation(uint256 agentId) external view returns (bool) {
        return _isActiveLiquidation(agentId);
    }

    function setGracePeriod(uint256 newPeriod) external onlyOwner {
        require(newPeriod >= 1 days && newPeriod <= 30 days, "Liquidation: invalid period");
        uint256 old = gracePeriod;
        gracePeriod = newPeriod;
        emit GracePeriodUpdated(old, newPeriod);
    }

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "Liquidation: zero address");
        controller = _controller;
    }

    function _isActiveLiquidation(uint256 agentId) internal view returns (bool) {
        LiquidationProcess memory liq = liquidations[agentId];
        return liq.triggeredAt != 0 && !liq.executed && !liq.cancelled;
    }
}
