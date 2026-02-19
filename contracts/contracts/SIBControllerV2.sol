// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC3475.sol";
import "./interfaces/IHalo2Verifier.sol";

// Interfaces (define locally as in v1)
interface INFARegistryV2 {
    function getAgentOwner(uint256 agentId) external view returns (address);
    function getAgentState(uint256 agentId) external view returns (uint8);
    function recordRevenue(uint256 agentId, uint256 amount) external;
    function updateSharpe(uint256 agentId, uint256 sharpeRatio, bytes32 proofHash) external;
    function updateCreditRating(uint256 agentId, uint8 rating) external;
    function recordCapitalRaised(uint256 agentId, uint256 amount) external;
    function revenueProfiles(uint256 agentId) external view returns (
        uint256 totalEarned, uint256 totalPayments, uint256 lastPaymentTime,
        uint256 sharpeRatio, bytes32 sharpeProofHash, uint8 currentMonthIndex, uint256 lastMonthTimestamp
    );
    function calculateCreditScore(uint256 agentId) external view returns (uint256 score, uint8 rating);
}

interface ISIBBondManagerV2 {
    function createBondClass(
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue, uint256 maxSupply, uint8 tranche, address paymentToken
    ) external returns (uint256 classId);
    function createNonce(uint256 classId, uint256 pricePerBond) external returns (uint256);
    function issue(address to, IERC3475.Transaction[] calldata txns) external;
    function redeem(address from, IERC3475.Transaction[] calldata txns) external;
    function markRedeemable(uint256 classId, uint256 nonceId) external;
    function balanceOf(address account, uint256 classId, uint256 nonceId) external view returns (uint256);
    function transferFrom(address from, address to, IERC3475.Transaction[] calldata txns) external;
    function bondClasses(uint256 classId) external view returns (
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue, uint256 maxSupply, uint8 tranche, address paymentToken, bool exists
    );
    function bondNonces(uint256 classId, uint256 nonceId) external view returns (
        uint256 issueTimestamp, uint256 maturityTimestamp, uint256 totalIssued,
        uint256 pricePerBond, bool redeemable, bool exists
    );
}

interface IDividendVaultV2 {
    function depositBNB(uint256 classId, uint256 nonceId) external payable;
    function depositERC20(uint256 classId, uint256 nonceId, address token, uint256 amount) external;
    function depositWaterfallBNB(
        uint256 seniorClassId, uint256 seniorNonceId,
        uint256 juniorClassId, uint256 juniorNonceId,
        uint256 seniorEntitlement
    ) external payable;
    function depositWaterfallERC20(
        uint256 seniorClassId, uint256 seniorNonceId,
        uint256 juniorClassId, uint256 juniorNonceId,
        address token, uint256 totalAmount, uint256 seniorEntitlement
    ) external;
    function updateOnTransfer(address from, address to, uint256 classId, uint256 nonceId, uint256 amount) external;
}

interface ITokenRegistry {
    function isTokenSupported(address token) external view returns (bool);
}

interface ITranchingEngine {
    function createTrancheGroup(
        uint256 agentId, uint256 seniorCouponBps, uint256 juniorCouponBps,
        uint256 maturityPeriod, uint256 seniorMaxSupply, uint256 juniorMaxSupply,
        uint256 sharpeRatioAtIssue, address paymentToken,
        uint256 seniorPricePerBond, uint256 juniorPricePerBond
    ) external returns (uint256 groupId, uint256 seniorClassId, uint256 juniorClassId);
    function calculateSeniorEntitlement(uint256 groupId, uint256 seniorNonceId, uint256 timeDelta) external view returns (uint256);
    function trancheGroups(uint256 groupId) external view returns (
        uint256 agentId, uint256 seniorClassId, uint256 juniorClassId,
        uint256 seniorCouponBps, uint256 juniorCouponBps, address paymentToken, bool exists
    );
}

interface ITEERegistry {
    function isTEEAgent(uint256 agentId, address candidate) external view returns (bool);
}

contract SIBControllerV2 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant BN254_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    INFARegistryV2 public nfaRegistry;
    ISIBBondManagerV2 public bondManager;
    IDividendVaultV2 public dividendVault;
    IHalo2Verifier public verifier;
    ITokenRegistry public tokenRegistry;
    ITranchingEngine public tranchingEngine;
    ITEERegistry public teeRegistry;

    uint256 public bondholderShareBps = 7000;
    uint256 public constant MAX_SHARE_BPS = 10000;
    uint256 public constant MIN_BONDHOLDER_SHARE_BPS = 1000;

    mapping(bytes32 => bool) public usedProofs;
    mapping(uint256 => uint256) public activeNonce; // classId => current nonceId

    // Revenue pool: agentId => token => accumulated revenue for distribution
    mapping(uint256 => mapping(address => uint256)) public revenuePool;

    // Dynamic coupon
    uint256 public baseCreditScore = 5000;
    uint256 public couponAdjustFactor = 5000; // bps

    // Track agent bond classes (for quick lookup)
    mapping(uint256 => uint256[]) public agentBondClasses; // agentId => classId[]

    // IPO capital available for agent to deploy (e.g. buy compute)
    mapping(uint256 => mapping(address => uint256)) public ipoCapital; // agentId => token => amount

    // Events
    event IPOInitiated(uint256 indexed agentId, uint256 indexed classId, uint256 nonceId, uint256 couponRateBps, uint256 pricePerBond, address paymentToken);
    event TranchedIPOInitiated(uint256 indexed agentId, uint256 indexed groupId, uint256 seniorClassId, uint256 juniorClassId);
    event BondsPurchased(address indexed buyer, uint256 indexed classId, uint256 nonceId, uint256 amount, uint256 totalCost, address paymentToken);
    event B402RevenueReceived(uint256 indexed agentId, address indexed token, uint256 amount, uint256 bondholderShare, uint256 ownerShare);
    event DividendsDistributed(uint256 indexed classId, uint256 nonceId, address token, uint256 amount);
    event SharpeProofVerified(uint256 indexed agentId, uint256 sharpeRatio, bytes32 proofHash);
    event CouponAdjusted(uint256 indexed classId, uint256 oldCoupon, uint256 newCoupon);
    event BondsRedeemed(address indexed holder, uint256 indexed classId, uint256 nonceId, uint256 amount);
    event BondsTransferred(address indexed from, address indexed to, uint256 indexed classId, uint256 nonceId, uint256 amount);
    event BondholderShareAdjusted(uint256 oldBps, uint256 newBps);
    event IPOCapitalReleased(uint256 indexed agentId, address indexed token, uint256 amount, address indexed recipient);

    constructor(
        address _nfaRegistry, address _bondManager, address _dividendVault,
        address _verifier, address _tokenRegistry
    ) Ownable(msg.sender) {
        require(_nfaRegistry != address(0), "SIBControllerV2: zero nfaRegistry");
        require(_bondManager != address(0), "SIBControllerV2: zero bondManager");
        require(_dividendVault != address(0), "SIBControllerV2: zero dividendVault");
        require(_verifier != address(0), "SIBControllerV2: zero verifier");
        require(_tokenRegistry != address(0), "SIBControllerV2: zero tokenRegistry");

        nfaRegistry = INFARegistryV2(_nfaRegistry);
        bondManager = ISIBBondManagerV2(_bondManager);
        dividendVault = IDividendVaultV2(_dividendVault);
        verifier = IHalo2Verifier(_verifier);
        tokenRegistry = ITokenRegistry(_tokenRegistry);
    }

    // --- IPO Functions ---

    function initiateIPO(
        uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod,
        uint256 pricePerBond, uint256 maxSupply, address paymentToken
    ) external whenNotPaused {
        require(_isAuthorizedForAgent(agentId), "SIBControllerV2: not authorized");
        require(nfaRegistry.getAgentState(agentId) == 1, "SIBControllerV2: agent not active");
        require(couponRateBps > 0 && couponRateBps <= MAX_SHARE_BPS, "SIBControllerV2: invalid coupon");
        require(maturityPeriod > 0, "SIBControllerV2: zero maturity");
        require(pricePerBond > 0, "SIBControllerV2: zero price");
        require(maxSupply > 0, "SIBControllerV2: zero supply");
        require(tokenRegistry.isTokenSupported(paymentToken), "SIBControllerV2: unsupported token");

        (,,, uint256 sharpeRatio,,,) = nfaRegistry.revenueProfiles(agentId);

        // v2: no hasIPO restriction - multiple series allowed
        uint256 classId = bondManager.createBondClass(
            agentId, couponRateBps, maturityPeriod, sharpeRatio, maxSupply, 0, paymentToken
        );
        uint256 nonceId = bondManager.createNonce(classId, pricePerBond);

        activeNonce[classId] = nonceId;
        agentBondClasses[agentId].push(classId);

        emit IPOInitiated(agentId, classId, nonceId, couponRateBps, pricePerBond, paymentToken);
    }

    function initiateTranchedIPO(
        uint256 agentId, uint256 seniorCouponBps, uint256 juniorCouponBps,
        uint256 maturityPeriod, uint256 seniorMaxSupply, uint256 juniorMaxSupply,
        address paymentToken, uint256 seniorPricePerBond, uint256 juniorPricePerBond
    ) external whenNotPaused {
        require(_isAuthorizedForAgent(agentId), "SIBControllerV2: not authorized");
        require(nfaRegistry.getAgentState(agentId) == 1, "SIBControllerV2: agent not active");
        require(address(tranchingEngine) != address(0), "SIBControllerV2: tranching not set");
        require(tokenRegistry.isTokenSupported(paymentToken), "SIBControllerV2: unsupported token");

        (,,, uint256 sharpeRatio,,,) = nfaRegistry.revenueProfiles(agentId);

        (uint256 groupId, uint256 seniorClassId, uint256 juniorClassId) = tranchingEngine.createTrancheGroup(
            agentId, seniorCouponBps, juniorCouponBps, maturityPeriod,
            seniorMaxSupply, juniorMaxSupply, sharpeRatio, paymentToken,
            seniorPricePerBond, juniorPricePerBond
        );

        activeNonce[seniorClassId] = 0;
        activeNonce[juniorClassId] = 0;
        agentBondClasses[agentId].push(seniorClassId);
        agentBondClasses[agentId].push(juniorClassId);

        emit TranchedIPOInitiated(agentId, groupId, seniorClassId, juniorClassId);
    }

    // --- Purchase Functions ---

    function purchaseBondsBNB(uint256 classId, uint256 amount) external payable nonReentrant whenNotPaused {
        (,,,,, , address paymentToken, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBControllerV2: class not found");
        require(paymentToken == address(0), "SIBControllerV2: not BNB class");
        require(amount > 0, "SIBControllerV2: zero amount");

        uint256 nonceId = activeNonce[classId];
        (,,, uint256 pricePerBond,, bool nonceExists) = bondManager.bondNonces(classId, nonceId);
        require(nonceExists, "SIBControllerV2: nonce not found");

        uint256 totalCost = pricePerBond * amount;
        require(msg.value >= totalCost, "SIBControllerV2: insufficient BNB");

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        bondManager.issue(msg.sender, txns);

        // Record capital raised for BAP-578 evolution
        (uint256 agentId,,,,,,, ) = bondManager.bondClasses(classId);
        nfaRegistry.recordCapitalRaised(agentId, totalCost);
        ipoCapital[agentId][address(0)] += totalCost;

        if (msg.value > totalCost) {
            (bool sent,) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(sent, "SIBControllerV2: refund failed");
        }

        emit BondsPurchased(msg.sender, classId, nonceId, amount, totalCost, address(0));
    }

    function purchaseBondsERC20(uint256 classId, uint256 amount) external nonReentrant whenNotPaused {
        (,,,,, , address paymentToken, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBControllerV2: class not found");
        require(paymentToken != address(0), "SIBControllerV2: not ERC20 class");
        require(amount > 0, "SIBControllerV2: zero amount");

        uint256 nonceId = activeNonce[classId];
        (,,, uint256 pricePerBond,, bool nonceExists) = bondManager.bondNonces(classId, nonceId);
        require(nonceExists, "SIBControllerV2: nonce not found");

        uint256 totalCost = pricePerBond * amount;
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), totalCost);

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        bondManager.issue(msg.sender, txns);

        // Record capital raised for BAP-578 evolution
        (uint256 agentId2,,,,,,, ) = bondManager.bondClasses(classId);
        nfaRegistry.recordCapitalRaised(agentId2, totalCost);
        ipoCapital[agentId2][paymentToken] += totalCost;

        emit BondsPurchased(msg.sender, classId, nonceId, amount, totalCost, paymentToken);
    }

    // --- Revenue Functions ---

    function receiveB402PaymentBNB(uint256 agentId) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "SIBControllerV2: zero payment");
        _processRevenue(agentId, address(0), msg.value);
    }

    function receiveB402PaymentERC20(uint256 agentId, address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SIBControllerV2: zero payment");
        require(token != address(0), "SIBControllerV2: use BNB variant");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _processRevenue(agentId, token, amount);
    }

    function _processRevenue(uint256 agentId, address token, uint256 amount) internal {
        nfaRegistry.recordRevenue(agentId, amount);

        uint256 bondholderShare = (amount * bondholderShareBps) / MAX_SHARE_BPS;
        uint256 ownerShare = amount - bondholderShare;

        revenuePool[agentId][token] += bondholderShare;

        address agentOwner = nfaRegistry.getAgentOwner(agentId);
        if (ownerShare > 0) {
            if (token == address(0)) {
                (bool sent,) = payable(agentOwner).call{value: ownerShare}("");
                require(sent, "SIBControllerV2: owner transfer failed");
            } else {
                IERC20(token).safeTransfer(agentOwner, ownerShare);
            }
        }

        emit B402RevenueReceived(agentId, token, amount, bondholderShare, ownerShare);
    }

    function distributeDividends(uint256 classId, uint256 nonceId) external whenNotPaused {
        (uint256 agentId,,,,, , address paymentToken, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBControllerV2: class not found");
        require(
            _isAuthorizedForAgent(agentId) || msg.sender == owner(),
            "SIBControllerV2: not authorized"
        );

        uint256 amount = revenuePool[agentId][paymentToken];
        require(amount > 0, "SIBControllerV2: no revenue");

        revenuePool[agentId][paymentToken] = 0;

        if (paymentToken == address(0)) {
            dividendVault.depositBNB{value: amount}(classId, nonceId);
        } else {
            IERC20(paymentToken).approve(address(dividendVault), amount);
            dividendVault.depositERC20(classId, nonceId, paymentToken, amount);
        }

        emit DividendsDistributed(classId, nonceId, paymentToken, amount);
    }

    // --- Transfer ---
    function transferBonds(address to, uint256 classId, uint256 nonceId, uint256 amount) external nonReentrant whenNotPaused {
        require(to != address(0), "SIBControllerV2: zero address");
        require(to != msg.sender, "SIBControllerV2: self-transfer");
        require(amount > 0, "SIBControllerV2: zero amount");

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        bondManager.transferFrom(msg.sender, to, txns);

        emit BondsTransferred(msg.sender, to, classId, nonceId, amount);
    }

    // --- ZK Proof ---
    function submitSharpeProof(uint256 agentId, bytes calldata proof, uint256[] calldata instances) external whenNotPaused {
        require(_isAuthorizedForAgent(agentId), "SIBControllerV2: not authorized");
        require(instances.length > 0, "SIBControllerV2: empty instances");

        bytes32 proofHash = keccak256(proof);
        require(!usedProofs[proofHash], "SIBControllerV2: proof already used");
        usedProofs[proofHash] = true;

        for (uint256 i = 0; i < instances.length; i++) {
            require(instances[i] < BN254_SCALAR_FIELD, "SIBControllerV2: instance out of field");
        }

        require(verifier.verifyProof(proof, instances), "SIBControllerV2: proof failed");

        uint256 sharpeRatio = instances[instances.length - 1];
        nfaRegistry.updateSharpe(agentId, sharpeRatio, proofHash);

        // Use multi-dimensional credit rating
        (, uint8 rating) = nfaRegistry.calculateCreditScore(agentId);
        nfaRegistry.updateCreditRating(agentId, rating);

        emit SharpeProofVerified(agentId, sharpeRatio, proofHash);
    }

    // --- Dynamic Coupon ---
    function calculateDynamicCoupon(uint256 classId) external view returns (uint256 newCouponBps) {
        (uint256 agentId, uint256 baseCoupon,,,,,, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBControllerV2: class not found");

        (uint256 currentScore,) = nfaRegistry.calculateCreditScore(agentId);

        if (currentScore >= baseCreditScore) {
            uint256 improvement = currentScore - baseCreditScore;
            uint256 reduction = (baseCoupon * improvement * couponAdjustFactor) / (10000 * 10000);
            newCouponBps = baseCoupon > reduction ? baseCoupon - reduction : 100; // min 1%
        } else {
            uint256 decline = baseCreditScore - currentScore;
            uint256 increase = (baseCoupon * decline * couponAdjustFactor) / (10000 * 10000);
            newCouponBps = baseCoupon + increase;
            if (newCouponBps > 3000) newCouponBps = 3000; // cap at 30%
        }
    }

    // --- Redemption ---
    function redeemBonds(uint256 classId, uint256 nonceId, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SIBControllerV2: zero amount");

        (,,,,, , address paymentToken,) = bondManager.bondClasses(classId);

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        bondManager.redeem(msg.sender, txns);

        (,,, uint256 pricePerBond,,) = bondManager.bondNonces(classId, nonceId);
        uint256 principal = pricePerBond * amount;

        if (principal > 0) {
            if (paymentToken == address(0)) {
                require(address(this).balance >= principal, "SIBControllerV2: insufficient BNB");
                (bool sent,) = payable(msg.sender).call{value: principal}("");
                require(sent, "SIBControllerV2: refund failed");
            } else {
                IERC20(paymentToken).safeTransfer(msg.sender, principal);
            }
        }

        emit BondsRedeemed(msg.sender, classId, nonceId, amount);
    }

    function markBondsRedeemable(uint256 classId, uint256 nonceId) external {
        (uint256 agentId,,,,,,, bool exists) = bondManager.bondClasses(classId);
        require(exists, "SIBControllerV2: class not found");
        require(_isAuthorizedForAgent(agentId), "SIBControllerV2: not authorized");
        bondManager.markRedeemable(classId, nonceId);
    }

    // --- Admin ---
    function adjustBondholderShare(uint256 newBps) external onlyOwner {
        require(newBps >= MIN_BONDHOLDER_SHARE_BPS && newBps <= MAX_SHARE_BPS, "SIBControllerV2: invalid share");
        uint256 old = bondholderShareBps;
        bondholderShareBps = newBps;
        emit BondholderShareAdjusted(old, newBps);
    }

    function setTranchingEngine(address _engine) external onlyOwner {
        require(_engine != address(0), "SIBControllerV2: zero address");
        tranchingEngine = ITranchingEngine(_engine);
    }

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "SIBControllerV2: zero address");
        verifier = IHalo2Verifier(_verifier);
    }

    function setTEERegistry(address _teeRegistry) external onlyOwner {
        teeRegistry = ITEERegistry(_teeRegistry);
    }

    function emergencyPause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // --- Capital Release ---
    function releaseIPOCapital(uint256 agentId, address token, uint256 amount) external nonReentrant whenNotPaused {
        require(_isAuthorizedForAgent(agentId), "SIBControllerV2: not authorized");
        require(amount > 0, "SIBControllerV2: zero amount");
        require(ipoCapital[agentId][token] >= amount, "SIBControllerV2: insufficient capital");

        ipoCapital[agentId][token] -= amount;

        if (token == address(0)) {
            require(address(this).balance >= amount, "SIBControllerV2: insufficient BNB");
            (bool sent,) = payable(msg.sender).call{value: amount}("");
            require(sent, "SIBControllerV2: transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit IPOCapitalReleased(agentId, token, amount, msg.sender);
    }

    // --- View ---
    function getAgentBondClasses(uint256 agentId) external view returns (uint256[] memory) {
        return agentBondClasses[agentId];
    }

    function hasIPO(uint256 agentId) external view returns (bool) {
        return agentBondClasses[agentId].length > 0;
    }

    receive() external payable {}

    function _isAuthorizedForAgent(uint256 agentId) internal view returns (bool) {
        if (nfaRegistry.getAgentOwner(agentId) == msg.sender) return true;
        return address(teeRegistry) != address(0) && teeRegistry.isTEEAgent(agentId, msg.sender);
    }
}
