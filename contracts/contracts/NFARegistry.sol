// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IBAP578.sol";
import "./libraries/CreditModel.sol";

/**
 * @title NFARegistry - Non-Fungible Agent Registry with SIB Extensions
 * @notice BAP-578 compliant agent registry with revenue profiles and credit ratings
 *         for the Sovereign Intelligence Bonds protocol.
 */
contract NFARegistry is ERC721Enumerable, Ownable, IBAP578 {
    // -- Enums & Structs --

    enum CreditRating {
        Unrated,
        C,
        B,
        A,
        AA,
        AAA
    }

    struct RevenueProfile {
        uint256 totalEarned;
        uint256 totalPayments;
        uint256 lastPaymentTime;
        uint256 sharpeRatio; // scaled 1e18
        bytes32 sharpeProofHash;
        // v2 additions
        uint256[12] monthlyRevenue; // rolling 12-month buffer (30-day periods)
        uint8 currentMonthIndex;    // 0-11 circular index
        uint256 lastMonthTimestamp; // detects month boundary
    }

    // -- State --

    uint256 private _nextAgentId = 1;
    address public controller;

    mapping(uint256 => AgentMetadata) private _metadata;
    mapping(uint256 => AgentState) private _states;
    mapping(uint256 => uint256) private _balances;
    mapping(uint256 => RevenueProfile) public revenueProfiles;
    mapping(uint256 => CreditRating) public creditRatings;
    mapping(uint256 => CreditModel.CreditFactors) public creditFactors;

    // -- Capital Evolution (BAP-578 extension) --
    mapping(uint256 => uint256) public capitalRaised;      // agentId => total capital from bond sales
    mapping(uint256 => uint8) public evolutionLevel;       // agentId => 0-5
    mapping(uint256 => bytes32) public agentMerkleRoot;    // agentId => merkle root state snapshot

    // Milestone thresholds: Seed(0.1) -> Angel(1) -> SeriesA(10) -> SeriesB(50) -> Unicorn(100)
    uint256[5] public milestoneThresholds = [
        0.1 ether,   // Level 1: Seed
        1 ether,     // Level 2: Angel
        10 ether,    // Level 3: Series A
        50 ether,    // Level 4: Series B
        100 ether    // Level 5: Unicorn
    ];

    // -- Events --

    event RevenueRecorded(uint256 indexed agentId, uint256 amount, uint256 totalEarned);
    event SharpeUpdated(uint256 indexed agentId, uint256 sharpeRatio, bytes32 proofHash);
    event CreditRatingUpdated(uint256 indexed agentId, CreditRating rating);
    event CreditFactorsUpdated(uint256 indexed agentId);
    event ControllerSet(address indexed controller);
    event CapitalEvolution(uint256 indexed agentId, uint8 newLevel, uint256 capitalRaisedTotal, bytes32 merkleRoot);
    event MerkleRootUpdated(uint256 indexed agentId, bytes32 merkleRoot);

    // -- Modifiers --

    modifier onlyController() {
        require(msg.sender == controller, "NFARegistry: caller is not controller");
        _;
    }

    modifier agentExists(uint256 agentId) {
        require(_ownerOf(agentId) != address(0), "NFARegistry: agent does not exist");
        _;
    }

    // -- Constructor --

    constructor() ERC721("Sovereign Intelligence Bond Agent", "SIB-NFA") Ownable(msg.sender) {}

    // -- BAP-578 Functions --

    function registerAgent(
        string calldata name,
        string calldata description,
        string calldata modelHash,
        string calldata endpoint
    ) external override returns (uint256 agentId) {
        require(bytes(name).length > 0, "NFARegistry: empty name");
        agentId = _nextAgentId++;

        _mint(msg.sender, agentId);

        _metadata[agentId] = AgentMetadata({
            name: name,
            description: description,
            modelHash: modelHash,
            endpoint: endpoint,
            registeredAt: block.timestamp
        });

        _states[agentId] = AgentState.Registered;

        emit AgentRegistered(agentId, msg.sender, name);
    }

    function updateState(uint256 agentId, AgentState newState) external override agentExists(agentId) {
        require(ownerOf(agentId) == msg.sender, "NFARegistry: caller is not agent owner");
        AgentState current = _states[agentId];
        // Enforce state machine: Registered -> Active -> Suspended -> Deregistered
        require(
            (current == AgentState.Registered && newState == AgentState.Active) ||
            (current == AgentState.Active && newState == AgentState.Suspended) ||
            (current == AgentState.Suspended && newState == AgentState.Deregistered),
            "NFARegistry: invalid state transition"
        );
        _states[agentId] = newState;
        emit AgentStateChanged(agentId, newState);
    }

    function fundAgent(uint256 agentId) external payable override agentExists(agentId) {
        require(msg.value > 0, "NFARegistry: must send value");
        _balances[agentId] += msg.value;
        emit AgentFunded(agentId, msg.value);
    }

    function withdrawAgentFunds(uint256 agentId, uint256 amount) external agentExists(agentId) {
        require(ownerOf(agentId) == msg.sender, "NFARegistry: caller is not agent owner");
        require(amount > 0 && amount <= _balances[agentId], "NFARegistry: invalid amount");
        _balances[agentId] -= amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "NFARegistry: transfer failed");
    }

    // -- SIB Extension Functions --

    function recordRevenue(uint256 agentId, uint256 amount) external onlyController agentExists(agentId) {
        require(_states[agentId] == AgentState.Active, "NFARegistry: agent is not active");
        require(amount > 0, "NFARegistry: amount must be positive");

        RevenueProfile storage profile = revenueProfiles[agentId];
        profile.totalEarned += amount;
        profile.totalPayments += 1;
        profile.lastPaymentTime = block.timestamp;

        // Monthly buffer tracking (30-day periods)
        if (profile.lastMonthTimestamp == 0) {
            // First revenue: initialize month timestamp
            profile.lastMonthTimestamp = block.timestamp;
        } else {
            // Check if we crossed a month boundary
            uint256 elapsed = block.timestamp - profile.lastMonthTimestamp;
            if (elapsed >= 30 days) {
                uint256 monthsAdvanced = elapsed / 30 days;
                for (uint256 i = 0; i < monthsAdvanced; i++) {
                    profile.currentMonthIndex = uint8((uint256(profile.currentMonthIndex) + 1) % 12);
                    profile.monthlyRevenue[profile.currentMonthIndex] = 0; // clear new slot
                }
                profile.lastMonthTimestamp += monthsAdvanced * 30 days;
            }
        }
        profile.monthlyRevenue[profile.currentMonthIndex] += amount;

        // Auto-update credit factors
        _updateCreditFactorsInternal(agentId);

        emit RevenueRecorded(agentId, amount, profile.totalEarned);
    }

    function updateSharpe(
        uint256 agentId,
        uint256 sharpeRatio,
        bytes32 proofHash
    ) external onlyController agentExists(agentId) {
        RevenueProfile storage profile = revenueProfiles[agentId];
        profile.sharpeRatio = sharpeRatio;
        profile.sharpeProofHash = proofHash;

        emit SharpeUpdated(agentId, sharpeRatio, proofHash);
    }

    function updateCreditRating(
        uint256 agentId,
        CreditRating rating
    ) external onlyController agentExists(agentId) {
        creditRatings[agentId] = rating;
        emit CreditRatingUpdated(agentId, rating);
    }

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "NFARegistry: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }

    function updateCreditFactors(
        uint256 agentId,
        CreditModel.CreditFactors calldata factors
    ) external onlyController agentExists(agentId) {
        creditFactors[agentId] = factors;
        emit CreditFactorsUpdated(agentId);
    }

    // -- Capital Evolution Functions (BAP-578 extension) --

    function recordCapitalRaised(uint256 agentId, uint256 amount) external onlyController agentExists(agentId) {
        require(amount > 0, "NFARegistry: zero amount");
        capitalRaised[agentId] += amount;

        // Check milestone progression
        uint8 currentLevel = evolutionLevel[agentId];
        uint8 newLevel = currentLevel;
        for (uint8 i = currentLevel; i < 5; i++) {
            if (capitalRaised[agentId] >= milestoneThresholds[i]) {
                newLevel = i + 1;
            } else {
                break;
            }
        }

        if (newLevel > currentLevel) {
            evolutionLevel[agentId] = newLevel;
            // Auto-update merkle root on evolution
            bytes32 root = _calculateMerkleRoot(agentId);
            agentMerkleRoot[agentId] = root;
            emit CapitalEvolution(agentId, newLevel, capitalRaised[agentId], root);
        }
    }

    function updateMerkleRoot(uint256 agentId, bytes32 root) external onlyController agentExists(agentId) {
        require(root != bytes32(0), "NFARegistry: zero root");
        agentMerkleRoot[agentId] = root;
        emit MerkleRootUpdated(agentId, root);
    }

    function _calculateMerkleRoot(uint256 agentId) internal view returns (bytes32) {
        RevenueProfile storage profile = revenueProfiles[agentId];
        AgentMetadata storage meta = _metadata[agentId];

        // Leaf nodes: hash of each state component
        bytes32 identityLeaf = keccak256(abi.encodePacked(
            meta.name, meta.modelHash, meta.registeredAt
        ));
        bytes32 revenueLeaf = keccak256(abi.encodePacked(
            profile.totalEarned, profile.totalPayments, profile.sharpeRatio
        ));
        bytes32 creditLeaf = keccak256(abi.encodePacked(
            uint8(creditRatings[agentId]),
            creditFactors[agentId].sharpeRatio,
            creditFactors[agentId].revenueStability
        ));
        bytes32 capitalLeaf = keccak256(abi.encodePacked(
            capitalRaised[agentId], evolutionLevel[agentId]
        ));

        // Two-level Merkle tree
        bytes32 leftBranch = keccak256(abi.encodePacked(identityLeaf, revenueLeaf));
        bytes32 rightBranch = keccak256(abi.encodePacked(creditLeaf, capitalLeaf));
        return keccak256(abi.encodePacked(leftBranch, rightBranch));
    }

    // -- View Functions --

    function getAgentMetadata(uint256 agentId) external view override agentExists(agentId) returns (AgentMetadata memory) {
        return _metadata[agentId];
    }

    function getAgentState(uint256 agentId) external view override agentExists(agentId) returns (AgentState) {
        return _states[agentId];
    }

    function getAgentOwner(uint256 agentId) external view override agentExists(agentId) returns (address) {
        return ownerOf(agentId);
    }

    function getRevenueProfile(uint256 agentId) external view agentExists(agentId) returns (RevenueProfile memory) {
        return revenueProfiles[agentId];
    }

    function calculateCreditScore(uint256 agentId) external view agentExists(agentId) returns (uint256 score, uint8 rating) {
        CreditModel.CreditFactors memory factors = creditFactors[agentId];
        (rating, score) = CreditModel.calculateMultiDimensionalRating(factors);
    }

    function getMonthlyRevenue(uint256 agentId) external view agentExists(agentId) returns (uint256[12] memory) {
        return revenueProfiles[agentId].monthlyRevenue;
    }

    function getAgentBalance(uint256 agentId) external view agentExists(agentId) returns (uint256) {
        return _balances[agentId];
    }

    function getEvolutionLevel(uint256 agentId) external view agentExists(agentId) returns (uint8) {
        return evolutionLevel[agentId];
    }

    function getMerkleRoot(uint256 agentId) external view agentExists(agentId) returns (bytes32) {
        return agentMerkleRoot[agentId];
    }

    function getCapitalRaised(uint256 agentId) external view agentExists(agentId) returns (uint256) {
        return capitalRaised[agentId];
    }

    function getMilestoneThresholds() external view returns (uint256[5] memory) {
        return milestoneThresholds;
    }

    // -- Internal Functions --

    function _updateCreditFactorsInternal(uint256 agentId) internal {
        RevenueProfile storage profile = revenueProfiles[agentId];
        AgentMetadata storage meta = _metadata[agentId];

        uint256 agentAge = block.timestamp - meta.registeredAt;

        // Revenue stability: count non-zero months / 12 (simple proxy)
        uint256 nonZeroMonths = 0;
        for (uint256 i = 0; i < 12; i++) {
            if (profile.monthlyRevenue[i] > 0) {
                nonZeroMonths++;
            }
        }
        uint256 revenueStability = (nonZeroMonths * 1e18) / 12;

        // Payment frequency: totalPayments * 1e18 / max(agentAge / 30 days, 1)
        uint256 monthsPassed = agentAge / 30 days;
        if (monthsPassed == 0) monthsPassed = 1;
        uint256 paymentFrequency = (profile.totalPayments * 1e18) / monthsPassed;
        if (paymentFrequency > 1e18) paymentFrequency = 1e18;

        creditFactors[agentId] = CreditModel.CreditFactors({
            sharpeRatio: profile.sharpeRatio,
            revenueStability: revenueStability,
            paymentFrequency: paymentFrequency,
            agentAge: agentAge,
            totalRevenue: profile.totalEarned
        });
    }
}
