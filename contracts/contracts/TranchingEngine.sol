// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ITrancheBondManager {
    function createBondClass(
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue, uint256 maxSupply, uint8 tranche, address paymentToken
    ) external returns (uint256 classId);
    function createNonce(uint256 classId, uint256 pricePerBond) external returns (uint256);
    function totalSupply(uint256 classId, uint256 nonceId) external view returns (uint256);
    function bondClasses(uint256 classId) external view returns (
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue, uint256 maxSupply, uint8 tranche, address paymentToken, bool exists
    );
}

contract TranchingEngine is Ownable {
    struct TrancheGroup {
        uint256 agentId;
        uint256 seniorClassId;
        uint256 juniorClassId;
        uint256 seniorCouponBps;
        uint256 juniorCouponBps;
        address paymentToken;
        bool exists;
    }

    ITrancheBondManager public bondManager;
    address public controller;

    mapping(uint256 => TrancheGroup) public trancheGroups;
    uint256 private _nextGroupId = 1;
    mapping(uint256 => uint256) public classToGroup; // classId -> groupId

    event TrancheGroupCreated(uint256 indexed groupId, uint256 indexed agentId, uint256 seniorClassId, uint256 juniorClassId);
    event ControllerSet(address indexed controller);

    modifier onlyController() {
        require(msg.sender == controller, "TranchingEngine: not controller");
        _;
    }

    constructor(address _bondManager) Ownable(msg.sender) {
        require(_bondManager != address(0), "TranchingEngine: zero bondManager");
        bondManager = ITrancheBondManager(_bondManager);
    }

    function createTrancheGroup(
        uint256 agentId,
        uint256 seniorCouponBps,
        uint256 juniorCouponBps,
        uint256 maturityPeriod,
        uint256 seniorMaxSupply,
        uint256 juniorMaxSupply,
        uint256 sharpeRatioAtIssue,
        address paymentToken,
        uint256 seniorPricePerBond,
        uint256 juniorPricePerBond
    ) external onlyController returns (uint256 groupId, uint256 seniorClassId, uint256 juniorClassId) {
        require(seniorCouponBps > 0 && seniorCouponBps <= 10000, "TranchingEngine: invalid senior coupon");
        require(juniorCouponBps > 0 && juniorCouponBps <= 10000, "TranchingEngine: invalid junior coupon");
        require(maturityPeriod > 0, "TranchingEngine: zero maturity");
        require(seniorMaxSupply > 0 && juniorMaxSupply > 0, "TranchingEngine: zero supply");

        // Create senior bond class (tranche=1)
        seniorClassId = bondManager.createBondClass(
            agentId, seniorCouponBps, maturityPeriod, sharpeRatioAtIssue, seniorMaxSupply, 1, paymentToken
        );
        bondManager.createNonce(seniorClassId, seniorPricePerBond);

        // Create junior bond class (tranche=2)
        juniorClassId = bondManager.createBondClass(
            agentId, juniorCouponBps, maturityPeriod, sharpeRatioAtIssue, juniorMaxSupply, 2, paymentToken
        );
        bondManager.createNonce(juniorClassId, juniorPricePerBond);

        groupId = _nextGroupId++;
        trancheGroups[groupId] = TrancheGroup({
            agentId: agentId,
            seniorClassId: seniorClassId,
            juniorClassId: juniorClassId,
            seniorCouponBps: seniorCouponBps,
            juniorCouponBps: juniorCouponBps,
            paymentToken: paymentToken,
            exists: true
        });

        classToGroup[seniorClassId] = groupId;
        classToGroup[juniorClassId] = groupId;

        emit TrancheGroupCreated(groupId, agentId, seniorClassId, juniorClassId);
    }

    // Calculate senior entitlement for waterfall
    function calculateSeniorEntitlement(
        uint256 groupId,
        uint256 seniorNonceId,
        uint256 timeDeltaSeconds
    ) external view returns (uint256) {
        TrancheGroup memory group = trancheGroups[groupId];
        require(group.exists, "TranchingEngine: group does not exist");

        uint256 seniorSupply = bondManager.totalSupply(group.seniorClassId, seniorNonceId);
        // entitlement = supply * couponBps / 10000 * timeDelta / 365 days
        return (seniorSupply * group.seniorCouponBps * timeDeltaSeconds) / (10000 * 365 days);
    }

    // View functions
    function getTrancheGroup(uint256 groupId) external view returns (TrancheGroup memory) {
        require(trancheGroups[groupId].exists, "TranchingEngine: group does not exist");
        return trancheGroups[groupId];
    }

    function isTranchedClass(uint256 classId) external view returns (bool) {
        return classToGroup[classId] != 0;
    }

    function getCounterpartClass(uint256 classId) external view returns (uint256) {
        uint256 groupId = classToGroup[classId];
        require(groupId != 0, "TranchingEngine: not a tranched class");
        TrancheGroup memory group = trancheGroups[groupId];
        if (classId == group.seniorClassId) return group.juniorClassId;
        return group.seniorClassId;
    }

    function getGroupCount() external view returns (uint256) {
        return _nextGroupId - 1;
    }

    // Admin
    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "TranchingEngine: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }
}
