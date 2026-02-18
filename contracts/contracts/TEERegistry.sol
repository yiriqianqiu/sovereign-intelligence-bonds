// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITEERegistry.sol";

interface INFARegistryCore {
    function getAgentOwner(uint256 agentId) external view returns (address);
}

contract TEERegistry is Ownable, ITEERegistry {
    INFARegistryCore public nfaCore;

    mapping(uint256 => address) public authorizedTEEAgent;   // agentId => TEE wallet
    mapping(uint256 => bytes32) public teeAttestationHash;   // latest TDX quote hash
    mapping(uint256 => uint256) public teeAttestationTime;   // latest attestation timestamp

    uint256 public constant ATTESTATION_VALIDITY = 24 hours;

    event TEEAgentAuthorized(uint256 indexed agentId, address indexed teeWallet);
    event TEEAgentRevoked(uint256 indexed agentId);
    event TEEAttestationPushed(uint256 indexed agentId, bytes32 quoteHash, uint256 timestamp);

    constructor(address _nfaCore) Ownable(msg.sender) {
        require(_nfaCore != address(0), "TEERegistry: zero nfaCore");
        nfaCore = INFARegistryCore(_nfaCore);
    }

    /// @notice Agent owner authorizes a TEE wallet to act on behalf of the agent
    function authorizeTEEAgent(uint256 agentId, address teeWallet) external {
        require(nfaCore.getAgentOwner(agentId) == msg.sender, "TEERegistry: not agent owner");
        require(teeWallet != address(0), "TEERegistry: zero teeWallet");
        authorizedTEEAgent[agentId] = teeWallet;
        emit TEEAgentAuthorized(agentId, teeWallet);
    }

    /// @notice Agent owner revokes TEE authorization
    function revokeTEEAgent(uint256 agentId) external {
        require(nfaCore.getAgentOwner(agentId) == msg.sender, "TEERegistry: not agent owner");
        require(authorizedTEEAgent[agentId] != address(0), "TEERegistry: no TEE authorized");
        delete authorizedTEEAgent[agentId];
        delete teeAttestationHash[agentId];
        delete teeAttestationTime[agentId];
        emit TEEAgentRevoked(agentId);
    }

    /// @notice TEE wallet pushes a remote attestation hash (e.g. every 12 hours)
    function pushTEEAttestation(uint256 agentId, bytes32 quoteHash) external {
        require(authorizedTEEAgent[agentId] == msg.sender, "TEERegistry: not authorized TEE");
        require(quoteHash != bytes32(0), "TEERegistry: zero quoteHash");
        teeAttestationHash[agentId] = quoteHash;
        teeAttestationTime[agentId] = block.timestamp;
        emit TEEAttestationPushed(agentId, quoteHash, block.timestamp);
    }

    /// @notice Check if candidate address is the authorized TEE agent for agentId
    function isTEEAgent(uint256 agentId, address candidate) external view returns (bool) {
        return authorizedTEEAgent[agentId] == candidate && candidate != address(0);
    }

    /// @notice Get TEE status for an agent
    function getTEEStatus(uint256 agentId) external view returns (
        address teeWallet,
        bytes32 quoteHash,
        uint256 attestedAt,
        bool isActive
    ) {
        teeWallet = authorizedTEEAgent[agentId];
        quoteHash = teeAttestationHash[agentId];
        attestedAt = teeAttestationTime[agentId];
        isActive = teeWallet != address(0) &&
                   attestedAt > 0 &&
                   (block.timestamp - attestedAt) <= ATTESTATION_VALIDITY;
    }
}
