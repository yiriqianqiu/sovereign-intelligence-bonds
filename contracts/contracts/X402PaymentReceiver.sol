// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title X402PaymentReceiver - HTTP 402 Payment Protocol Receiver
 * @notice Records x402 micropayments from AI agents and forwards BNB to the SIB controller
 *         for dividend distribution.
 */
contract X402PaymentReceiver is Ownable, ReentrancyGuard {
    struct PaymentRecord {
        address payer;
        uint256 agentId;
        string endpoint;
        uint256 amount;
        uint256 timestamp;
    }

    address public controller;
    PaymentRecord[] public payments;
    mapping(uint256 => uint256) public agentTotalPayments;

    // -- Events --

    event PaymentReceived(address indexed payer, uint256 indexed agentId, string endpoint, uint256 amount);
    event ControllerSet(address indexed controller);

    // -- Constructor --

    constructor() Ownable(msg.sender) {}

    // -- Core Functions --

    /**
     * @notice Record an x402 payment and forward BNB to the controller.
     * @param agentId The NFA agent ID receiving payment
     * @param endpoint The API endpoint being accessed
     */
    function pay(uint256 agentId, string calldata endpoint) external payable nonReentrant {
        require(msg.value > 0, "X402PaymentReceiver: zero payment");
        require(controller != address(0), "X402PaymentReceiver: controller not set");

        payments.push(PaymentRecord({
            payer: msg.sender,
            agentId: agentId,
            endpoint: endpoint,
            amount: msg.value,
            timestamp: block.timestamp
        }));

        agentTotalPayments[agentId] += msg.value;

        // Forward BNB to controller via receiveX402Payment
        (bool sent, ) = controller.call{value: msg.value}(
            abi.encodeWithSignature("receiveX402Payment(uint256)", agentId)
        );
        require(sent, "X402PaymentReceiver: forward failed");

        emit PaymentReceived(msg.sender, agentId, endpoint, msg.value);
    }

    // -- View Functions --

    function getPaymentCount() external view returns (uint256) {
        return payments.length;
    }

    function getPayment(uint256 index) external view returns (PaymentRecord memory) {
        require(index < payments.length, "X402PaymentReceiver: index out of bounds");
        return payments[index];
    }

    // -- Admin Functions --

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "X402PaymentReceiver: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }
}
