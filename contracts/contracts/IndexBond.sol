// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC3475.sol";

contract IndexBond is Ownable, ReentrancyGuard {
    struct Index {
        string name;
        uint256[] classIds;
        uint256[] weights;     // bps, sum = 10000
        uint256[] nonceIds;    // active nonce for each class
        bool active;
    }

    address public bondManager;
    address public controller;

    mapping(uint256 => Index) public indices;
    uint256 private _nextIndexId = 1;

    // user => indexId => shares
    mapping(address => mapping(uint256 => uint256)) public userShares;
    mapping(uint256 => uint256) public totalShares;

    event IndexCreated(uint256 indexed indexId, string name, uint256 componentCount);
    event IndexMinted(uint256 indexed indexId, address indexed user, uint256 shares);
    event IndexRedeemed(uint256 indexed indexId, address indexed user, uint256 shares);
    event IndexRebalanced(uint256 indexed indexId);

    constructor(address _bondManager, address _controller) Ownable(msg.sender) {
        require(_bondManager != address(0) && _controller != address(0), "IndexBond: zero address");
        bondManager = _bondManager;
        controller = _controller;
    }

    function createIndex(
        string calldata name, uint256[] calldata classIds,
        uint256[] calldata weights, uint256[] calldata nonceIds
    ) external onlyOwner returns (uint256 indexId) {
        require(classIds.length > 0 && classIds.length <= 10, "IndexBond: 1-10 components");
        require(classIds.length == weights.length && classIds.length == nonceIds.length, "IndexBond: length mismatch");

        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            require(weights[i] > 0, "IndexBond: zero weight");
            totalWeight += weights[i];
        }
        require(totalWeight == 10000, "IndexBond: weights must sum to 10000");

        indexId = _nextIndexId++;
        // Store manually since dynamic arrays can't be set in one shot for storage
        Index storage idx = indices[indexId];
        idx.name = name;
        idx.classIds = classIds;
        idx.weights = weights;
        idx.nonceIds = nonceIds;
        idx.active = true;

        emit IndexCreated(indexId, name, classIds.length);
    }

    function mintIndex(uint256 indexId, uint256 shares) external payable nonReentrant {
        Index storage idx = indices[indexId];
        require(idx.active, "IndexBond: not active");
        require(shares > 0, "IndexBond: zero shares");

        // For each component, transfer proportional bonds from user to this contract
        for (uint256 i = 0; i < idx.classIds.length; i++) {
            uint256 bondAmount = (shares * idx.weights[i]) / 10000;
            if (bondAmount > 0) {
                IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
                txns[0] = IERC3475.Transaction({classId: idx.classIds[i], nonceId: idx.nonceIds[i], amount: bondAmount});
                IERC3475(bondManager).transferFrom(msg.sender, address(this), txns);
            }
        }

        userShares[msg.sender][indexId] += shares;
        totalShares[indexId] += shares;

        emit IndexMinted(indexId, msg.sender, shares);
    }

    function redeemIndex(uint256 indexId, uint256 shares) external nonReentrant {
        require(shares > 0, "IndexBond: zero shares");
        require(userShares[msg.sender][indexId] >= shares, "IndexBond: insufficient shares");

        Index storage idx = indices[indexId];

        for (uint256 i = 0; i < idx.classIds.length; i++) {
            uint256 bondAmount = (shares * idx.weights[i]) / 10000;
            if (bondAmount > 0) {
                IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
                txns[0] = IERC3475.Transaction({classId: idx.classIds[i], nonceId: idx.nonceIds[i], amount: bondAmount});
                IERC3475(bondManager).transferFrom(address(this), msg.sender, txns);
            }
        }

        userShares[msg.sender][indexId] -= shares;
        totalShares[indexId] -= shares;

        emit IndexRedeemed(indexId, msg.sender, shares);
    }

    function rebalance(uint256 indexId, uint256[] calldata newWeights) external onlyOwner {
        Index storage idx = indices[indexId];
        require(idx.active, "IndexBond: not active");
        require(newWeights.length == idx.classIds.length, "IndexBond: length mismatch");

        uint256 total = 0;
        for (uint256 i = 0; i < newWeights.length; i++) {
            require(newWeights[i] > 0, "IndexBond: zero weight");
            total += newWeights[i];
        }
        require(total == 10000, "IndexBond: weights must sum to 10000");

        idx.weights = newWeights;
        emit IndexRebalanced(indexId);
    }

    function deactivateIndex(uint256 indexId) external onlyOwner {
        indices[indexId].active = false;
    }

    function getIndex(uint256 indexId) external view returns (
        string memory name, uint256[] memory classIds, uint256[] memory weights,
        uint256[] memory nonceIds, bool active
    ) {
        Index storage idx = indices[indexId];
        return (idx.name, idx.classIds, idx.weights, idx.nonceIds, idx.active);
    }

    function getIndexCount() external view returns (uint256) {
        return _nextIndexId - 1;
    }
}
