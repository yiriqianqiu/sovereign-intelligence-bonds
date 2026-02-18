// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IBAP578 - BNB Chain Agent Protocol Standard
 * @notice Public interface for BAP-578 Non-Fungible Agent (NFA) registration
 */
interface IBAP578 {
    enum AgentState {
        Registered,
        Active,
        Suspended,
        Deregistered
    }

    struct AgentMetadata {
        string name;
        string description;
        string modelHash;
        string endpoint;
        uint256 registeredAt;
    }

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name);
    event AgentStateChanged(uint256 indexed agentId, AgentState newState);
    event AgentFunded(uint256 indexed agentId, uint256 amount);

    function registerAgent(
        string calldata name,
        string calldata description,
        string calldata modelHash,
        string calldata endpoint
    ) external returns (uint256 agentId);

    function updateState(uint256 agentId, AgentState newState) external;
    function fundAgent(uint256 agentId) external payable;

    function getAgentMetadata(uint256 agentId) external view returns (AgentMetadata memory);
    function getAgentState(uint256 agentId) external view returns (AgentState);
    function getAgentOwner(uint256 agentId) external view returns (address);
}
