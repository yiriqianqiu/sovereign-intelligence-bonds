// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title X402PaymentReceiverV2 - Multi-token HTTP 402 Payment Protocol Receiver
 * @notice Records x402 micropayments (BNB + ERC20) from AI agents and forwards to
 *         the SIB controller for dividend distribution.
 */
contract X402PaymentReceiverV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct PaymentRecord {
        address payer;
        uint256 agentId;
        string endpoint;
        address token;      // address(0) = BNB
        uint256 amount;
        uint256 timestamp;
    }

    address public controller;
    PaymentRecord[] public payments;
    mapping(uint256 => mapping(address => uint256)) public agentTotalPayments;

    // -- Events --

    event PaymentReceived(address indexed payer, uint256 indexed agentId, address indexed token, string endpoint, uint256 amount);
    event ControllerSet(address indexed controller);

    mapping(address => bool) public authorizedRelays;
    bool public relayRestricted;

    event RelayAuthorized(address indexed relay, bool authorized);
    event RelayRestrictionSet(bool restricted);

    // -- Constructor --

    constructor() Ownable(msg.sender) {}

    // -- Modifiers --

    modifier onlyAuthorizedRelay() {
        if (relayRestricted) {
            require(authorizedRelays[msg.sender], "X402V2: unauthorized relay");
        }
        _;
    }

    // -- Core Functions --

    /**
     * @notice Record a BNB x402 payment and forward to the controller.
     * @param agentId The NFA agent ID receiving payment
     * @param endpoint The API endpoint being accessed
     */
    function payBNB(uint256 agentId, string calldata endpoint) external payable nonReentrant onlyAuthorizedRelay {
        require(msg.value > 0, "X402V2: zero payment");
        require(controller != address(0), "X402V2: controller not set");

        payments.push(PaymentRecord({
            payer: msg.sender,
            agentId: agentId,
            endpoint: endpoint,
            token: address(0),
            amount: msg.value,
            timestamp: block.timestamp
        }));
        agentTotalPayments[agentId][address(0)] += msg.value;

        (bool sent, ) = controller.call{value: msg.value}(
            abi.encodeWithSignature("receiveX402PaymentBNB(uint256)", agentId)
        );
        require(sent, "X402V2: forward failed");

        emit PaymentReceived(msg.sender, agentId, address(0), endpoint, msg.value);
    }

    /**
     * @notice Record an ERC20 x402 payment and forward to the controller.
     * @param agentId The NFA agent ID receiving payment
     * @param token The ERC20 token address
     * @param amount The payment amount
     * @param endpoint The API endpoint being accessed
     */
    function payERC20(uint256 agentId, address token, uint256 amount, string calldata endpoint) external nonReentrant onlyAuthorizedRelay {
        require(amount > 0, "X402V2: zero payment");
        require(token != address(0), "X402V2: use payBNB");
        require(controller != address(0), "X402V2: controller not set");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        payments.push(PaymentRecord({
            payer: msg.sender,
            agentId: agentId,
            endpoint: endpoint,
            token: token,
            amount: amount,
            timestamp: block.timestamp
        }));
        agentTotalPayments[agentId][token] += amount;

        IERC20(token).approve(controller, amount);

        (bool sent, ) = controller.call(
            abi.encodeWithSignature("receiveX402PaymentERC20(uint256,address,uint256)", agentId, token, amount)
        );
        require(sent, "X402V2: forward failed");

        emit PaymentReceived(msg.sender, agentId, token, endpoint, amount);
    }

    // -- View Functions --

    function getPaymentCount() external view returns (uint256) {
        return payments.length;
    }

    function getPayment(uint256 index) external view returns (PaymentRecord memory) {
        require(index < payments.length, "X402V2: out of bounds");
        return payments[index];
    }

    // -- Admin Functions --

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "X402V2: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }

    function setAuthorizedRelay(address relay, bool authorized) external onlyOwner {
        require(relay != address(0), "X402V2: zero address");
        authorizedRelays[relay] = authorized;
        emit RelayAuthorized(relay, authorized);
    }

    function setRelayRestricted(bool restricted) external onlyOwner {
        relayRestricted = restricted;
        emit RelayRestrictionSet(restricted);
    }
}
