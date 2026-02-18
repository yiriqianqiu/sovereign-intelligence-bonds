// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITEERegistry {
    function isTEEAgent(uint256 agentId, address candidate) external view returns (bool);
    function getTEEStatus(uint256 agentId) external view returns (
        address teeWallet,
        bytes32 quoteHash,
        uint256 attestedAt,
        bool isActive
    );
}
