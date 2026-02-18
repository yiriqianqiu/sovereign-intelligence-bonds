// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface INFARegistryForGreenfield {
    function getAgentOwner(uint256 agentId) external view returns (address);
    function getAgentState(uint256 agentId) external view returns (uint8);
}

interface ITEERegistryForGreenfield {
    function isTEEAgent(uint256 agentId, address candidate) external view returns (bool);
}

/**
 * @title GreenfieldDataVault
 * @notice On-chain registry of BNB Greenfield storage objects linked to NFA agents.
 *         Tracks data assets (model weights, training data, performance records)
 *         stored on Greenfield, creating a verifiable "data asset layer" for bond valuation.
 */
contract GreenfieldDataVault is Ownable {
    enum DataType { Model, Training, Performance, Inference, Config }

    struct DataAsset {
        uint256 agentId;
        string bucketName;
        string objectName;
        bytes32 contentHash;
        DataType dataType;
        uint256 size;           // bytes
        uint256 registeredAt;
        bool verified;
        bool active;
    }

    INFARegistryForGreenfield public nfaRegistry;
    address public verifierAddress; // authorized off-chain verifier
    ITEERegistryForGreenfield public teeRegistry;

    uint256 private _nextAssetId = 1;

    mapping(uint256 => DataAsset) public dataAssets;
    mapping(uint256 => uint256[]) public agentAssets;
    mapping(bytes32 => bool) public usedHashes;

    event DataAssetRegistered(
        uint256 indexed assetId,
        uint256 indexed agentId,
        string bucketName,
        string objectName,
        bytes32 contentHash,
        DataType dataType,
        uint256 size
    );
    event DataAssetVerified(uint256 indexed assetId, uint256 indexed agentId);
    event DataAssetDeactivated(uint256 indexed assetId, uint256 indexed agentId);
    event VerifierSet(address indexed verifier);
    event TEERegistrySet(address indexed teeRegistry);

    constructor(address _nfaRegistry) Ownable(msg.sender) {
        require(_nfaRegistry != address(0), "GreenfieldDataVault: zero registry");
        nfaRegistry = INFARegistryForGreenfield(_nfaRegistry);
    }

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "GreenfieldDataVault: zero verifier");
        verifierAddress = _verifier;
        emit VerifierSet(_verifier);
    }

    function setTEERegistry(address _teeRegistry) external onlyOwner {
        teeRegistry = ITEERegistryForGreenfield(_teeRegistry);
        emit TEERegistrySet(_teeRegistry);
    }

    function registerDataAsset(
        uint256 agentId,
        string calldata bucketName,
        string calldata objectName,
        bytes32 contentHash,
        DataType dataType,
        uint256 size
    ) external returns (uint256 assetId) {
        require(
            nfaRegistry.getAgentOwner(agentId) == msg.sender ||
            (address(teeRegistry) != address(0) && teeRegistry.isTEEAgent(agentId, msg.sender)),
            "GreenfieldDataVault: not authorized"
        );
        require(nfaRegistry.getAgentState(agentId) == 1, "GreenfieldDataVault: agent not active");
        require(bytes(bucketName).length > 0, "GreenfieldDataVault: empty bucket");
        require(bytes(objectName).length > 0, "GreenfieldDataVault: empty object");
        require(contentHash != bytes32(0), "GreenfieldDataVault: zero hash");
        require(size > 0, "GreenfieldDataVault: zero size");
        require(!usedHashes[contentHash], "GreenfieldDataVault: duplicate hash");

        usedHashes[contentHash] = true;
        assetId = _nextAssetId++;

        dataAssets[assetId] = DataAsset({
            agentId: agentId,
            bucketName: bucketName,
            objectName: objectName,
            contentHash: contentHash,
            dataType: dataType,
            size: size,
            registeredAt: block.timestamp,
            verified: false,
            active: true
        });

        agentAssets[agentId].push(assetId);

        emit DataAssetRegistered(assetId, agentId, bucketName, objectName, contentHash, dataType, size);
    }

    function verifyAsset(uint256 assetId) external {
        DataAsset storage asset = dataAssets[assetId];
        require(
            msg.sender == verifierAddress || msg.sender == owner() ||
            (address(teeRegistry) != address(0) && teeRegistry.isTEEAgent(asset.agentId, msg.sender)),
            "GreenfieldDataVault: not authorized"
        );
        require(asset.active, "GreenfieldDataVault: asset not active");
        require(!asset.verified, "GreenfieldDataVault: already verified");

        asset.verified = true;
        emit DataAssetVerified(assetId, asset.agentId);
    }

    function deactivateAsset(uint256 assetId) external {
        DataAsset storage asset = dataAssets[assetId];
        require(asset.active, "GreenfieldDataVault: asset not active");
        require(
            nfaRegistry.getAgentOwner(asset.agentId) == msg.sender || msg.sender == owner(),
            "GreenfieldDataVault: not authorized"
        );

        asset.active = false;
        emit DataAssetDeactivated(assetId, asset.agentId);
    }

    // -- View Functions --

    function getAgentAssets(uint256 agentId) external view returns (uint256[] memory) {
        return agentAssets[agentId];
    }

    function getAgentAssetCount(uint256 agentId) external view returns (uint256) {
        return agentAssets[agentId].length;
    }

    function getVerifiedAssetCount(uint256 agentId) external view returns (uint256 count) {
        uint256[] storage ids = agentAssets[agentId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (dataAssets[ids[i]].verified && dataAssets[ids[i]].active) {
                count++;
            }
        }
    }

    function getTotalDataSize(uint256 agentId) external view returns (uint256 totalSize) {
        uint256[] storage ids = agentAssets[agentId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (dataAssets[ids[i]].active) {
                totalSize += dataAssets[ids[i]].size;
            }
        }
    }

    function getDataAsset(uint256 assetId) external view returns (DataAsset memory) {
        require(dataAssets[assetId].registeredAt > 0, "GreenfieldDataVault: asset not found");
        return dataAssets[assetId];
    }
}
