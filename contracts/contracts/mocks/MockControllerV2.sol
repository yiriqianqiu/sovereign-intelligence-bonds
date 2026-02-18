// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockControllerV2 - Test-only mock for SIBController's multi-token payment receiver
 * @notice Accepts BNB and ERC20 payments and records the last call parameters.
 */
contract MockControllerV2 {
    uint256 public lastAgentId;
    uint256 public lastBNBAmount;
    address public lastToken;
    uint256 public lastERC20Amount;
    uint256 public totalBNBReceived;
    uint256 public totalERC20Received;

    function receiveX402PaymentBNB(uint256 agentId) external payable {
        lastAgentId = agentId;
        lastBNBAmount = msg.value;
        totalBNBReceived += msg.value;
    }

    function receiveX402PaymentERC20(uint256 agentId, address token, uint256 amount) external {
        lastAgentId = agentId;
        lastToken = token;
        lastERC20Amount = amount;
        totalERC20Received += amount;

        // Pull tokens from sender (the X402PaymentReceiverV2 contract)
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    receive() external payable {}
}
