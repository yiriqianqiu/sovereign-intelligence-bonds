// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IERC3475.sol";
import "./interfaces/IHalo2Verifier.sol";

interface INFARegistry {
    function getAgentOwner(uint256 agentId) external view returns (address);
    function getAgentState(uint256 agentId) external view returns (uint8);
    function recordRevenue(uint256 agentId, uint256 amount) external;
    function updateSharpe(uint256 agentId, uint256 sharpeRatio, bytes32 proofHash) external;
    function updateCreditRating(uint256 agentId, uint8 rating) external;
    function revenueProfiles(uint256 agentId) external view returns (
        uint256 totalEarned,
        uint256 totalPayments,
        uint256 lastPaymentTime,
        uint256 sharpeRatio,
        bytes32 sharpeProofHash
    );
}

interface ISIBBondManager {
    function createBondClass(
        uint256 agentId, uint256 couponRateBps,
        uint256 maturityPeriod, uint256 sharpeRatioAtIssue, uint256 maxSupply,
        uint8 tranche, address paymentToken
    ) external returns (uint256 classId);
    function createNonce(uint256 classId, uint256 pricePerBond) external returns (uint256);
    function issue(address to, IERC3475.Transaction[] calldata txns) external;
    function redeem(address from, IERC3475.Transaction[] calldata txns) external;
    function markRedeemable(uint256 classId, uint256 nonceId) external;
    function balanceOf(address account, uint256 classId, uint256 nonceId) external view returns (uint256);
    function bondClasses(uint256 classId) external view returns (
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue, uint256 maxSupply, uint8 tranche,
        address paymentToken, bool exists
    );
    function bondNonces(uint256 classId, uint256 nonceId) external view returns (
        uint256 issueTimestamp, uint256 maturityTimestamp, uint256 totalIssued,
        uint256 pricePerBond, bool redeemable, bool exists
    );
    function transferFrom(address from, address to, IERC3475.Transaction[] calldata txns) external;
}

interface IDividendVault {
    function deposit(uint256 classId, uint256 nonceId) external payable;
    function updateOnTransfer(address from, address to, uint256 classId, uint256 nonceId, uint256 amount) external;
}

/**
 * @title SIBController - Sovereign Intelligence Bonds Orchestrator
 * @notice Central coordinator for the SIB protocol. Manages bond issuance (IPO),
 *         purchases, x402 revenue intake, zkML Sharpe proof verification,
 *         dividend distribution, and bond redemption.
 */
contract SIBController is Ownable, ReentrancyGuard, Pausable {

    // -- Constants (BN254 for EZKL) --

    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // -- State --

    INFARegistry public nfaRegistry;
    ISIBBondManager public bondManager;
    IDividendVault public dividendVault;
    IHalo2Verifier public verifier;

    uint256 public bondholderShareBps = 7000; // 70% of x402 revenue to bondholders
    uint256 public constant MAX_SHARE_BPS = 10000;

    // Proof replay prevention: keccak256(proof) => used
    mapping(bytes32 => bool) public usedProofs;

    // IPO tracking: classId => active nonce for purchases
    mapping(uint256 => uint256) public activeNonce;

    // Agent bond class mapping: agentId => classId
    mapping(uint256 => uint256) public agentBondClass;
    mapping(uint256 => bool) public hasIPO;

    // Revenue pool: agentId => accumulated BNB from x402 pending distribution
    mapping(uint256 => uint256) public revenuePool;

    // -- Events --

    event IPOInitiated(uint256 indexed agentId, uint256 indexed classId, uint256 nonceId, uint256 couponRateBps, uint256 pricePerBond);
    event BondsPurchased(address indexed buyer, uint256 indexed classId, uint256 nonceId, uint256 amount, uint256 totalCost);
    event X402RevenueReceived(uint256 indexed agentId, uint256 amount, uint256 bondholderShare, uint256 ownerShare);
    event SharpeProofVerified(uint256 indexed agentId, uint256 sharpeRatio, bytes32 proofHash);
    event DividendsDistributed(uint256 indexed classId, uint256 nonceId, uint256 amount);
    event BondsRedeemed(address indexed holder, uint256 indexed classId, uint256 nonceId, uint256 amount);
    event BondholderShareAdjusted(uint256 oldBps, uint256 newBps);
    event BondsTransferred(address indexed from, address indexed to, uint256 indexed classId, uint256 nonceId, uint256 amount);

    // -- Constructor --

    constructor(
        address _nfaRegistry,
        address _bondManager,
        address _dividendVault,
        address _verifier
    ) Ownable(msg.sender) {
        require(_nfaRegistry != address(0), "SIBController: zero nfaRegistry");
        require(_bondManager != address(0), "SIBController: zero bondManager");
        require(_dividendVault != address(0), "SIBController: zero dividendVault");
        require(_verifier != address(0), "SIBController: zero verifier");

        nfaRegistry = INFARegistry(_nfaRegistry);
        bondManager = ISIBBondManager(_bondManager);
        dividendVault = IDividendVault(_dividendVault);
        verifier = IHalo2Verifier(_verifier);
    }

    // -- IPO Functions --

    /**
     * @notice Agent owner initiates an IPO by creating a bond class and first nonce.
     * @param agentId The NFA agent ID
     * @param couponRateBps Annual coupon rate in basis points
     * @param maturityPeriod Bond maturity in seconds
     * @param pricePerBond Price per bond in wei
     * @param maxSupply Maximum bonds for this class
     */
    function initiateIPO(
        uint256 agentId,
        uint256 couponRateBps,
        uint256 maturityPeriod,
        uint256 pricePerBond,
        uint256 maxSupply
    ) external whenNotPaused {
        require(nfaRegistry.getAgentOwner(agentId) == msg.sender, "SIBController: not agent owner");
        require(nfaRegistry.getAgentState(agentId) == 1, "SIBController: agent not active");
        require(!hasIPO[agentId], "SIBController: IPO already exists");
        require(couponRateBps > 0 && couponRateBps <= MAX_SHARE_BPS, "SIBController: invalid coupon rate");
        require(maturityPeriod > 0, "SIBController: zero maturity");
        require(pricePerBond > 0, "SIBController: zero price");
        require(maxSupply > 0, "SIBController: zero supply");

        // Get Sharpe ratio from NFA registry
        (,,, uint256 sharpeRatio,) = nfaRegistry.revenueProfiles(agentId);

        // Auto-increment classId (decoupled from agentId)
        uint256 classId = bondManager.createBondClass(agentId, couponRateBps, maturityPeriod, sharpeRatio, maxSupply, 0, address(0));

        uint256 nonceId = bondManager.createNonce(classId, pricePerBond);

        agentBondClass[agentId] = classId;
        hasIPO[agentId] = true;
        activeNonce[classId] = nonceId;

        emit IPOInitiated(agentId, classId, nonceId, couponRateBps, pricePerBond);
    }

    /**
     * @notice Purchase bonds from an active IPO.
     * @param classId Bond class (= agentId)
     * @param amount Number of bonds to purchase
     */
    function purchaseBonds(uint256 classId, uint256 amount) external payable nonReentrant whenNotPaused {
        require(amount > 0, "SIBController: zero amount");

        uint256 nonceId = activeNonce[classId];
        (,,, uint256 pricePerBond,, bool exists) = bondManager.bondNonces(classId, nonceId);
        require(exists, "SIBController: nonce does not exist");

        uint256 totalCost = pricePerBond * amount;
        require(msg.value >= totalCost, "SIBController: insufficient payment");

        // Issue bonds
        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({ classId: classId, nonceId: nonceId, amount: amount });
        bondManager.issue(msg.sender, txns);

        // Refund excess
        if (msg.value > totalCost) {
            (bool sent, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(sent, "SIBController: refund failed");
        }

        emit BondsPurchased(msg.sender, classId, nonceId, amount, totalCost);
    }

    /**
     * @notice Transfer bonds with proper dividend accounting.
     * @dev Must use this instead of direct bondManager.transferFrom to preserve dividend consistency.
     */
    function transferBonds(
        address to,
        uint256 classId,
        uint256 nonceId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(to != address(0), "SIBController: transfer to zero address");
        require(to != msg.sender, "SIBController: self-transfer");
        require(amount > 0, "SIBController: zero amount");

        // Execute transfer (BondManager hook updates DividendVault automatically)
        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({ classId: classId, nonceId: nonceId, amount: amount });
        bondManager.transferFrom(msg.sender, to, txns);

        emit BondsTransferred(msg.sender, to, classId, nonceId, amount);
    }

    // -- Revenue Functions --

    /**
     * @notice Receive x402 payment revenue for an agent. Splits between bondholders and agent owner.
     * @param agentId The NFA agent generating revenue
     */
    function receiveX402Payment(uint256 agentId) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "SIBController: zero payment");
        require(hasIPO[agentId], "SIBController: no IPO for agent");

        // Record revenue on NFA registry
        nfaRegistry.recordRevenue(agentId, msg.value);

        // Split revenue
        uint256 bondholderShare = (msg.value * bondholderShareBps) / MAX_SHARE_BPS;
        uint256 ownerShare = msg.value - bondholderShare;

        // Accumulate bondholder share for distribution
        revenuePool[agentId] += bondholderShare;

        // Forward owner share
        address agentOwner = nfaRegistry.getAgentOwner(agentId);
        if (ownerShare > 0) {
            (bool sent, ) = payable(agentOwner).call{value: ownerShare}("");
            require(sent, "SIBController: owner transfer failed");
        }

        emit X402RevenueReceived(agentId, msg.value, bondholderShare, ownerShare);
    }

    /**
     * @notice Distribute accumulated revenue to bondholders via DividendVault.
     * @param classId The bond class to distribute dividends for
     * @param nonceId The nonce to distribute to
     */
    function distributeDividends(uint256 classId, uint256 nonceId) external whenNotPaused {
        (uint256 agentId,,,,,,, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBController: class does not exist");
        require(
            nfaRegistry.getAgentOwner(agentId) == msg.sender || msg.sender == owner(),
            "SIBController: not agent owner or admin"
        );

        uint256 amount = revenuePool[agentId];
        require(amount > 0, "SIBController: no revenue to distribute");

        revenuePool[agentId] = 0;
        dividendVault.deposit{value: amount}(classId, nonceId);

        emit DividendsDistributed(classId, nonceId, amount);
    }

    // -- ZK Proof Functions --

    /**
     * @notice Submit a zkML Sharpe ratio proof for an agent.
     * @param agentId The NFA agent
     * @param proof The EZKL Halo2 proof bytes
     * @param instances Public inputs/outputs of the circuit
     */
    function submitSharpeProof(
        uint256 agentId,
        bytes calldata proof,
        uint256[] calldata instances
    ) external whenNotPaused {
        require(nfaRegistry.getAgentOwner(agentId) == msg.sender, "SIBController: not agent owner");
        require(instances.length > 0, "SIBController: empty instances");

        // Replay prevention
        bytes32 proofHash = keccak256(proof);
        require(!usedProofs[proofHash], "SIBController: proof already used");
        usedProofs[proofHash] = true;

        // Validate instances are in BN254 scalar field
        for (uint256 i = 0; i < instances.length; i++) {
            require(instances[i] < BN254_SCALAR_FIELD, "SIBController: instance out of field");
        }

        // Verify proof
        require(verifier.verifyProof(proof, instances), "SIBController: proof verification failed");

        // Extract Sharpe ratio from instances (last output)
        uint256 sharpeRatio = instances[instances.length - 1];
        nfaRegistry.updateSharpe(agentId, sharpeRatio, proofHash);

        // Update credit rating based on Sharpe ratio
        uint8 rating = _calculateCreditRating(sharpeRatio);
        nfaRegistry.updateCreditRating(agentId, rating);

        emit SharpeProofVerified(agentId, sharpeRatio, proofHash);
    }

    // -- Redemption Functions --

    /**
     * @notice Redeem mature bonds. Agent owner must mark them redeemable first.
     * @param classId Bond class
     * @param nonceId Bond nonce
     * @param amount Number of bonds to redeem
     */
    function redeemBonds(uint256 classId, uint256 nonceId, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SIBController: zero amount");

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({ classId: classId, nonceId: nonceId, amount: amount });
        bondManager.redeem(msg.sender, txns);

        // Return principal
        (,,, uint256 pricePerBond,,) = bondManager.bondNonces(classId, nonceId);
        uint256 principal = pricePerBond * amount;

        if (principal > 0) {
            require(address(this).balance >= principal, "SIBController: insufficient funds for redemption");
            (bool sent, ) = payable(msg.sender).call{value: principal}("");
            require(sent, "SIBController: principal refund failed");
        }

        emit BondsRedeemed(msg.sender, classId, nonceId, amount);
    }

    /**
     * @notice Mark bonds as redeemable. Only agent owner can do this.
     * @param classId Bond class
     * @param nonceId Bond nonce
     */
    function markBondsRedeemable(uint256 classId, uint256 nonceId) external {
        (uint256 agentId,,,,,,, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBController: class does not exist");
        require(nfaRegistry.getAgentOwner(agentId) == msg.sender, "SIBController: not agent owner");

        bondManager.markRedeemable(classId, nonceId);
    }

    // -- Admin Functions --

    uint256 public constant MIN_BONDHOLDER_SHARE_BPS = 1000; // 10% minimum

    function adjustBondholderShare(uint256 newBps) external onlyOwner {
        require(newBps >= MIN_BONDHOLDER_SHARE_BPS, "SIBController: below minimum 10%");
        require(newBps <= MAX_SHARE_BPS, "SIBController: exceeds max");
        uint256 oldBps = bondholderShareBps;
        bondholderShareBps = newBps;
        emit BondholderShareAdjusted(oldBps, newBps);
    }

    function emergencyPause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "SIBController: zero address");
        verifier = IHalo2Verifier(_verifier);
    }

    // -- Internal Functions --

    /**
     * @notice Calculate credit rating based on Sharpe ratio (scaled 1e18).
     * Thresholds: <0.5 = C, <1.0 = B, <1.5 = A, <2.0 = AA, >=2.0 = AAA
     */
    function _calculateCreditRating(uint256 sharpeRatio) internal pure returns (uint8) {
        if (sharpeRatio < 0.5e18) return 1;      // C
        if (sharpeRatio < 1.0e18) return 2;       // B
        if (sharpeRatio < 1.5e18) return 3;       // A
        if (sharpeRatio < 2.0e18) return 4;       // AA
        return 5;                                  // AAA
    }

    // Allow receiving BNB
    receive() external payable {}
}
