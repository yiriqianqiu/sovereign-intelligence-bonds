// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IERC3475.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SIBBondManager
 * @notice ERC-3475 multi-class semi-fungible bond manager for Sovereign Intelligence Bonds.
 *         Each bond class represents an NFA agent's securitized revenue stream.
 *         Nonces represent individual issuance batches with maturity schedules.
 */
contract SIBBondManager is IERC3475, Ownable {

    // -- Structs --

    struct BondClass {
        uint256 agentId;
        uint256 couponRateBps;       // basis points (e.g., 500 = 5%)
        uint256 maturityPeriod;       // seconds
        uint256 sharpeRatioAtIssue;   // 1e18 scaled
        uint256 maxSupply;
        uint8 tranche;               // 0=standard, 1=senior, 2=junior
        address paymentToken;         // address(0)=BNB, else ERC-20
        bool exists;
    }

    struct BondNonce {
        uint256 issueTimestamp;
        uint256 maturityTimestamp;
        uint256 totalIssued;
        uint256 pricePerBond;
        bool redeemable;
        bool exists;
    }

    // -- Events --

    event BondClassCreated(
        uint256 indexed classId,
        uint256 agentId,
        uint256 couponRateBps,
        uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue,
        uint256 maxSupply,
        uint8 tranche,
        address paymentToken
    );
    event BondNonceCreated(uint256 indexed classId, uint256 indexed nonceId, uint256 pricePerBond);
    event BondMarkedRedeemable(uint256 indexed classId, uint256 indexed nonceId);

    // -- Storage --

    uint256 private _nextClassId = 1;
    mapping(uint256 => uint256[]) public agentClassIds; // agentId -> classId[]

    mapping(uint256 => BondClass) public bondClasses;
    mapping(uint256 => mapping(uint256 => BondNonce)) public bondNonces;
    mapping(uint256 => uint256) public nextNonceId;

    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) private _balances;
    mapping(uint256 => mapping(uint256 => uint256)) private _totalSupply;
    mapping(address => mapping(address => bool)) private _approvals;

    address public controller;

    // -- Modifiers --

    modifier onlyController() {
        require(msg.sender == controller, "SIBBondManager: caller is not the controller");
        _;
    }

    // -- Constructor --

    constructor() Ownable(msg.sender) {}

    // -- Owner functions --

    event ControllerSet(address indexed controller);
    event DividendVaultSet(address indexed dividendVault);

    address public dividendVault;

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "SIBBondManager: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }

    function setDividendVault(address _dividendVault) external onlyOwner {
        require(_dividendVault != address(0), "SIBBondManager: zero address");
        dividendVault = _dividendVault;
        emit DividendVaultSet(_dividendVault);
    }

    // -- Controller functions --

    function createBondClass(
        uint256 agentId,
        uint256 couponRateBps,
        uint256 maturityPeriod,
        uint256 sharpeRatioAtIssue,
        uint256 maxSupply,
        uint8 tranche,
        address paymentToken
    ) external onlyController returns (uint256 classId) {
        require(maxSupply > 0, "SIBBondManager: maxSupply must be > 0");

        classId = _nextClassId++;
        bondClasses[classId] = BondClass({
            agentId: agentId,
            couponRateBps: couponRateBps,
            maturityPeriod: maturityPeriod,
            sharpeRatioAtIssue: sharpeRatioAtIssue,
            maxSupply: maxSupply,
            tranche: tranche,
            paymentToken: paymentToken,
            exists: true
        });
        agentClassIds[agentId].push(classId);

        emit BondClassCreated(classId, agentId, couponRateBps, maturityPeriod, sharpeRatioAtIssue, maxSupply, tranche, paymentToken);
    }

    function createNonce(uint256 classId, uint256 pricePerBond) external onlyController returns (uint256 nonceId) {
        require(bondClasses[classId].exists, "SIBBondManager: class does not exist");
        require(pricePerBond > 0, "SIBBondManager: pricePerBond must be > 0");

        nonceId = nextNonceId[classId];
        nextNonceId[classId] = nonceId + 1;

        bondNonces[classId][nonceId] = BondNonce({
            issueTimestamp: block.timestamp,
            maturityTimestamp: block.timestamp + bondClasses[classId].maturityPeriod,
            totalIssued: 0,
            pricePerBond: pricePerBond,
            redeemable: false,
            exists: true
        });

        emit BondNonceCreated(classId, nonceId, pricePerBond);
    }

    function markRedeemable(uint256 classId, uint256 nonceId) external onlyController {
        require(bondNonces[classId][nonceId].exists, "SIBBondManager: nonce does not exist");
        bondNonces[classId][nonceId].redeemable = true;
        emit BondMarkedRedeemable(classId, nonceId);
    }

    // -- View functions --

    function getAgentClassIds(uint256 agentId) external view returns (uint256[] memory) {
        return agentClassIds[agentId];
    }

    function getClassesByTranche(uint256 agentId, uint8 tranche) external view returns (uint256[] memory) {
        uint256[] storage allIds = agentClassIds[agentId];
        // First pass: count matches
        uint256 count = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (bondClasses[allIds[i]].tranche == tranche) {
                count++;
            }
        }
        // Second pass: populate result
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (bondClasses[allIds[i]].tranche == tranche) {
                result[idx++] = allIds[i];
            }
        }
        return result;
    }

    // -- ERC-3475: issue / redeem / burn --

    function issue(address to, Transaction[] calldata transactions) external override onlyController {
        require(to != address(0), "SIBBondManager: issue to zero address");

        for (uint256 i = 0; i < transactions.length; i++) {
            uint256 classId = transactions[i].classId;
            uint256 nonceId = transactions[i].nonceId;
            uint256 amount = transactions[i].amount;

            require(bondNonces[classId][nonceId].exists, "SIBBondManager: nonce does not exist");
            require(
                _totalSupply[classId][nonceId] + amount <= bondClasses[classId].maxSupply,
                "SIBBondManager: exceeds maxSupply"
            );

            _balances[to][classId][nonceId] += amount;
            _totalSupply[classId][nonceId] += amount;
            bondNonces[classId][nonceId].totalIssued += amount;
        }

        emit Issue(msg.sender, to, transactions);
    }

    function redeem(address from, Transaction[] calldata transactions) external override onlyController {
        for (uint256 i = 0; i < transactions.length; i++) {
            uint256 classId = transactions[i].classId;
            uint256 nonceId = transactions[i].nonceId;
            uint256 amount = transactions[i].amount;

            BondNonce storage nonce = bondNonces[classId][nonceId];
            require(nonce.exists, "SIBBondManager: nonce does not exist");
            require(nonce.redeemable, "SIBBondManager: not redeemable");
            require(block.timestamp >= nonce.maturityTimestamp, "SIBBondManager: not mature");
            require(_balances[from][classId][nonceId] >= amount, "SIBBondManager: insufficient balance");

            _balances[from][classId][nonceId] -= amount;
            _totalSupply[classId][nonceId] -= amount;
        }

        emit Redeem(msg.sender, from, transactions);
    }

    function burn(address from, Transaction[] calldata transactions) external override onlyController {
        for (uint256 i = 0; i < transactions.length; i++) {
            uint256 classId = transactions[i].classId;
            uint256 nonceId = transactions[i].nonceId;
            uint256 amount = transactions[i].amount;

            require(_balances[from][classId][nonceId] >= amount, "SIBBondManager: insufficient balance");

            _balances[from][classId][nonceId] -= amount;
            _totalSupply[classId][nonceId] -= amount;
        }

        emit Burn(msg.sender, from, transactions);
    }

    // -- ERC-3475: transfer --

    function transferFrom(
        address from,
        address to,
        Transaction[] calldata transactions
    ) external override {
        require(to != address(0), "SIBBondManager: transfer to zero address");
        require(from != to, "SIBBondManager: self-transfer");
        require(
            msg.sender == from || msg.sender == controller || _approvals[from][msg.sender],
            "SIBBondManager: not owner or approved"
        );

        for (uint256 i = 0; i < transactions.length; i++) {
            uint256 classId = transactions[i].classId;
            uint256 nonceId = transactions[i].nonceId;
            uint256 amount = transactions[i].amount;

            require(_balances[from][classId][nonceId] >= amount, "SIBBondManager: insufficient balance");

            // Notify dividend vault before balance change (if set)
            if (dividendVault != address(0)) {
                (bool ok, ) = dividendVault.call(
                    abi.encodeWithSignature(
                        "updateOnTransfer(address,address,uint256,uint256,uint256)",
                        from, to, classId, nonceId, amount
                    )
                );
                require(ok, "SIBBondManager: dividend vault update failed");
            }

            _balances[from][classId][nonceId] -= amount;
            _balances[to][classId][nonceId] += amount;
        }

        emit Transfer(msg.sender, from, to, transactions);
    }

    // -- ERC-3475: approval --

    function setApprovalFor(address operator, bool approved) external override {
        require(operator != msg.sender, "SIBBondManager: self-approval");
        _approvals[msg.sender][operator] = approved;
        emit ApprovalFor(msg.sender, operator, approved);
    }

    function isApprovedFor(address owner, address operator) external view override returns (bool) {
        return _approvals[owner][operator];
    }

    // -- ERC-3475: view --

    function balanceOf(address account, uint256 classId, uint256 nonceId)
        external
        view
        override
        returns (uint256)
    {
        return _balances[account][classId][nonceId];
    }

    function totalSupply(uint256 classId, uint256 nonceId) external view override returns (uint256) {
        return _totalSupply[classId][nonceId];
    }

    /**
     * @notice Returns metadata schema for bond classes.
     * @param metadataId 0-6 correspond to the seven class metadata fields.
     */
    function classMetadata(uint256 metadataId) external pure override returns (Metadata memory) {
        if (metadataId == 0) {
            return Metadata("Agent ID", "uint256", "BAP-578 NFA agent identifier");
        } else if (metadataId == 1) {
            return Metadata("Coupon Rate (bps)", "uint256", "Annual coupon rate in basis points");
        } else if (metadataId == 2) {
            return Metadata("Maturity Period", "uint256", "Bond maturity period in seconds");
        } else if (metadataId == 3) {
            return Metadata("Sharpe Ratio at Issue", "uint256", "zkML-verified Sharpe ratio (scaled 1e4)");
        } else if (metadataId == 4) {
            return Metadata("Max Supply", "uint256", "Maximum bond supply for this class");
        } else if (metadataId == 5) {
            return Metadata("Tranche", "uint8", "Bond tranche: 0=standard, 1=senior, 2=junior");
        } else if (metadataId == 6) {
            return Metadata("Payment Token", "address", "Payment token address (zero = BNB)");
        } else {
            revert("SIBBondManager: invalid metadataId");
        }
    }

    /**
     * @notice Returns actual class-level values for a given classId.
     */
    function classValues(uint256 classId, uint256 metadataId)
        external
        view
        override
        returns (Values memory)
    {
        require(bondClasses[classId].exists, "SIBBondManager: class does not exist");
        BondClass storage bc = bondClasses[classId];

        Values memory v;
        if (metadataId == 0) {
            v.uintValue = bc.agentId;
        } else if (metadataId == 1) {
            v.uintValue = bc.couponRateBps;
        } else if (metadataId == 2) {
            v.uintValue = bc.maturityPeriod;
        } else if (metadataId == 3) {
            v.uintValue = bc.sharpeRatioAtIssue;
        } else if (metadataId == 4) {
            v.uintValue = bc.maxSupply;
        } else if (metadataId == 5) {
            v.uintValue = uint256(bc.tranche);
        } else if (metadataId == 6) {
            v.addressValue = bc.paymentToken;
        } else {
            revert("SIBBondManager: invalid metadataId");
        }
        return v;
    }

    /**
     * @notice Returns nonce-level values for a given classId + nonceId.
     */
    function nonceValues(uint256 classId, uint256 nonceId, uint256 metadataId)
        external
        view
        override
        returns (Values memory)
    {
        require(bondNonces[classId][nonceId].exists, "SIBBondManager: nonce does not exist");
        BondNonce storage bn = bondNonces[classId][nonceId];

        Values memory v;
        if (metadataId == 0) {
            v.uintValue = bn.issueTimestamp;
        } else if (metadataId == 1) {
            v.uintValue = bn.maturityTimestamp;
        } else if (metadataId == 2) {
            v.uintValue = bn.totalIssued;
        } else if (metadataId == 3) {
            v.uintValue = bn.pricePerBond;
        } else if (metadataId == 4) {
            v.boolValue = bn.redeemable;
        } else {
            revert("SIBBondManager: invalid metadataId");
        }
        return v;
    }
}
