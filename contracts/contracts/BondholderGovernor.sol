// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IGovernanceBondManager {
    function balanceOf(address account, uint256 classId, uint256 nonceId) external view returns (uint256);
    function totalSupply(uint256 classId, uint256 nonceId) external view returns (uint256);
    function nextNonceId(uint256 classId) external view returns (uint256);
}

contract BondholderGovernor is Ownable {
    enum ProposalType { CouponChange, ShareChange, AgentSuspend }
    enum ProposalState { Active, Passed, Rejected, Executed, Cancelled }

    struct Proposal {
        uint256 classId;
        ProposalType proposalType;
        uint256 newValue;      // coupon bps, share bps, or 1 for suspend
        uint256 forVotes;
        uint256 againstVotes;
        uint256 startTime;
        uint256 endTime;
        ProposalState state;
        address proposer;
    }

    IGovernanceBondManager public bondManager;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 private _nextProposalId = 1;

    uint256 public quorumBps = 2000; // 20%
    uint256 public votingPeriod = 3 days;

    event ProposalCreated(uint256 indexed proposalId, uint256 classId, ProposalType proposalType, uint256 newValue, address proposer);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);

    constructor(address _bondManager) Ownable(msg.sender) {
        require(_bondManager != address(0), "Governor: zero address");
        bondManager = IGovernanceBondManager(_bondManager);
    }

    function createProposal(uint256 classId, ProposalType proposalType, uint256 newValue) external returns (uint256) {
        // Validate the proposer holds bonds
        uint256 voterWeight = _getVotingWeight(msg.sender, classId);
        require(voterWeight > 0, "Governor: no voting power");

        // Validate newValue based on type
        if (proposalType == ProposalType.CouponChange) {
            require(newValue >= 100 && newValue <= 3000, "Governor: coupon out of range (100-3000)");
        } else if (proposalType == ProposalType.ShareChange) {
            require(newValue >= 1000 && newValue <= 9000, "Governor: share out of range (10-90%)");
        } else {
            require(newValue == 1, "Governor: suspend value must be 1");
        }

        uint256 proposalId = _nextProposalId++;
        proposals[proposalId] = Proposal({
            classId: classId,
            proposalType: proposalType,
            newValue: newValue,
            forVotes: 0,
            againstVotes: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + votingPeriod,
            state: ProposalState.Active,
            proposer: msg.sender
        });

        emit ProposalCreated(proposalId, classId, proposalType, newValue, msg.sender);
        return proposalId;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.state == ProposalState.Active, "Governor: not active");
        require(block.timestamp <= proposal.endTime, "Governor: voting ended");
        require(!hasVoted[proposalId][msg.sender], "Governor: already voted");

        uint256 weight = _getVotingWeight(msg.sender, proposal.classId);
        require(weight > 0, "Governor: no voting power");

        hasVoted[proposalId][msg.sender] = true;
        if (support) {
            proposal.forVotes += weight;
        } else {
            proposal.againstVotes += weight;
        }

        emit Voted(proposalId, msg.sender, support, weight);
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.state == ProposalState.Active, "Governor: not active");
        require(block.timestamp > proposal.endTime, "Governor: voting not ended");

        uint256 totalVotes = proposal.forVotes + proposal.againstVotes;
        uint256 totalCirculating = _getTotalCirculating(proposal.classId);
        uint256 quorumRequired = (totalCirculating * quorumBps) / 10000;

        if (totalVotes >= quorumRequired && proposal.forVotes > proposal.againstVotes) {
            proposal.state = ProposalState.Passed;
            // NOTE: Actual parameter changes would be applied by the controller
            // Governor just records the decision
            emit ProposalExecuted(proposalId);
        } else {
            proposal.state = ProposalState.Rejected;
        }
    }

    function cancelProposal(uint256 proposalId) external onlyOwner {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.state == ProposalState.Active, "Governor: not active");
        proposal.state = ProposalState.Cancelled;
        emit ProposalCancelled(proposalId);
    }

    // View functions
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getProposalState(uint256 proposalId) external view returns (ProposalState) {
        Proposal memory p = proposals[proposalId];
        if (p.state != ProposalState.Active) return p.state;
        if (block.timestamp <= p.endTime) return ProposalState.Active;
        // After voting period, still Active until executeProposal is called
        return ProposalState.Active;
    }

    function getProposalCount() external view returns (uint256) {
        return _nextProposalId - 1;
    }

    // Internal: get total bonds across all nonces for a class
    function _getVotingWeight(address voter, uint256 classId) internal view returns (uint256) {
        uint256 total = 0;
        uint256 nonceCount = bondManager.nextNonceId(classId);
        for (uint256 i = 0; i < nonceCount; i++) {
            total += bondManager.balanceOf(voter, classId, i);
        }
        return total;
    }

    function _getTotalCirculating(uint256 classId) internal view returns (uint256) {
        uint256 total = 0;
        uint256 nonceCount = bondManager.nextNonceId(classId);
        for (uint256 i = 0; i < nonceCount; i++) {
            total += bondManager.totalSupply(classId, i);
        }
        return total;
    }
}
