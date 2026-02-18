// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockX402Controller - Test-only mock for SIBController's receiveX402Payment
 * @notice Accepts BNB and records the last call parameters. Used only in tests.
 */
contract MockX402Controller {
    uint256 public lastAgentId;
    uint256 public lastAmount;
    uint256 public totalReceived;

    function receiveX402Payment(uint256 agentId) external payable {
        lastAgentId = agentId;
        lastAmount = msg.value;
        totalReceived += msg.value;
    }

    receive() external payable {}
}
