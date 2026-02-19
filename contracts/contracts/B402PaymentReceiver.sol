// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/ITEERegistry.sol";

/**
 * @title B402PaymentReceiver - BNB Chain Native HTTP 402 Payment Protocol
 * @notice Implements the b402 Relayer pattern: accepts EIP-712 signed payment
 *         authorizations for gasless agent-to-agent micropayments on BSC.
 *         Supports any BEP-20 token + native BNB.
 *
 * Payment modes:
 *   1. payWithSignature() -- gasless: payer signs EIP-712 message, relayer submits tx
 *   2. payBNB() / payERC20() -- direct: caller pays gas and sends funds directly
 *   3. payBNBVerified() -- TEE-verified: requires hardware-signed receipt, prevents wash trading
 */
contract B402PaymentReceiver is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address payer,uint256 agentId,address token,uint256 amount,string endpoint,uint256 nonce,uint256 deadline)"
    );

    bytes32 public constant TEE_RECEIPT_TYPEHASH = keccak256(
        "TEEReceipt(uint256 agentId,uint256 amount,string endpoint,uint256 timestamp,bytes32 logicHash)"
    );

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

    // EIP-712 replay protection
    mapping(address => uint256) public nonces;

    // Relay authorization
    mapping(address => bool) public authorizedRelays;
    bool public relayRestricted;

    // TEE receipt verification
    ITEERegistry public teeRegistry;
    bool public teeVerificationRequired;   // when true, only payBNBVerified is accepted
    uint256 public constant TEE_RECEIPT_VALIDITY = 5 minutes;
    mapping(bytes32 => bool) public usedReceipts;  // replay protection for TEE receipts

    // Verified revenue tracking
    mapping(uint256 => uint256) public verifiedRevenue;  // agentId => total verified BNB
    uint256 public totalVerifiedPayments;

    // -- Events --

    event PaymentReceived(address indexed payer, uint256 indexed agentId, address indexed token, string endpoint, uint256 amount);
    event SignedPaymentReceived(address indexed payer, uint256 indexed agentId, address indexed token, string endpoint, uint256 amount, address relayer);
    event VerifiedPaymentReceived(uint256 indexed agentId, uint256 amount, bytes32 logicHash, address indexed teeWallet);
    event ControllerSet(address indexed controller);
    event RelayAuthorized(address indexed relay, bool authorized);
    event RelayRestrictionSet(bool restricted);
    event TEERegistrySet(address indexed teeRegistry);
    event TEEVerificationSet(bool required);

    // -- Constructor --

    constructor() Ownable(msg.sender) EIP712("B402PaymentReceiver", "1") {}

    // -- Modifiers --

    modifier onlyAuthorizedRelay() {
        if (relayRestricted) {
            require(authorizedRelays[msg.sender], "B402: unauthorized relay");
        }
        _;
    }

    // -- Gasless Payment (b402 Relayer Pattern) --

    /**
     * @notice Execute a gasless BEP-20 payment via EIP-712 signature.
     *         The payer signs off-chain; the relayer submits and pays gas.
     *         Payer must have approved this contract for the token amount.
     * @param payer     The address that signed the payment authorization
     * @param agentId   The NFA agent ID receiving payment
     * @param token     BEP-20 token address (must not be address(0))
     * @param amount    Payment amount in token units
     * @param endpoint  The API endpoint being accessed
     * @param deadline  Signature expiry timestamp
     * @param signature EIP-712 signature from payer
     */
    function payWithSignature(
        address payer,
        uint256 agentId,
        address token,
        uint256 amount,
        string calldata endpoint,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant onlyAuthorizedRelay {
        require(block.timestamp <= deadline, "B402: signature expired");
        require(amount > 0, "B402: zero payment");
        require(token != address(0), "B402: use payBNB for native");
        require(controller != address(0), "B402: controller not set");

        // Verify EIP-712 signature
        uint256 currentNonce = nonces[payer]++;
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            payer,
            agentId,
            token,
            amount,
            keccak256(bytes(endpoint)),
            currentNonce,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        require(signer == payer, "B402: invalid signature");

        // Pull tokens from payer (requires prior approval)
        IERC20(token).safeTransferFrom(payer, address(this), amount);

        // Record
        payments.push(PaymentRecord({
            payer: payer,
            agentId: agentId,
            endpoint: endpoint,
            token: token,
            amount: amount,
            timestamp: block.timestamp
        }));
        agentTotalPayments[agentId][token] += amount;

        // Forward to controller
        IERC20(token).approve(controller, amount);
        (bool sent, ) = controller.call(
            abi.encodeWithSignature("receiveB402PaymentERC20(uint256,address,uint256)", agentId, token, amount)
        );
        require(sent, "B402: forward failed");

        emit SignedPaymentReceived(payer, agentId, token, endpoint, amount, msg.sender);
    }

    // -- Direct Payments (backward-compatible) --

    /**
     * @notice Record a BNB payment and forward to the controller.
     *         When teeVerificationRequired is true, this function is disabled -- use payBNBVerified instead.
     */
    function payBNB(uint256 agentId, string calldata endpoint) external payable nonReentrant onlyAuthorizedRelay {
        require(!teeVerificationRequired, "B402: TEE verification required, use payBNBVerified");
        require(msg.value > 0, "B402: zero payment");
        require(controller != address(0), "B402: controller not set");

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
            abi.encodeWithSignature("receiveB402PaymentBNB(uint256)", agentId)
        );
        require(sent, "B402: forward failed");

        emit PaymentReceived(msg.sender, agentId, address(0), endpoint, msg.value);
    }

    /**
     * @notice Record an ERC20 payment and forward to the controller.
     */
    function payERC20(uint256 agentId, address token, uint256 amount, string calldata endpoint) external nonReentrant onlyAuthorizedRelay {
        require(amount > 0, "B402: zero payment");
        require(token != address(0), "B402: use payBNB");
        require(controller != address(0), "B402: controller not set");

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
            abi.encodeWithSignature("receiveB402PaymentERC20(uint256,address,uint256)", agentId, token, amount)
        );
        require(sent, "B402: forward failed");

        emit PaymentReceived(msg.sender, agentId, token, endpoint, amount);
    }

    // -- View Functions --

    function getPaymentCount() external view returns (uint256) {
        return payments.length;
    }

    function getPayment(uint256 index) external view returns (PaymentRecord memory) {
        require(index < payments.length, "B402: out of bounds");
        return payments[index];
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -- TEE-Verified Payments --

    /**
     * @notice Record a BNB payment verified by TEE hardware signature.
     *         The TEE agent signs a receipt proving the revenue was generated by real API service,
     *         not developer wash trading. Contract verifies via ecrecover against TEERegistry.
     * @param agentId    The NFA agent ID
     * @param endpoint   The API endpoint that generated this revenue
     * @param timestamp  When the TEE generated this receipt
     * @param logicHash  SHA256 of the agent's executing code (proves code integrity)
     * @param teeSignature ECDSA signature from TEE hardware wallet
     */
    function payBNBVerified(
        uint256 agentId,
        string calldata endpoint,
        uint256 timestamp,
        bytes32 logicHash,
        bytes calldata teeSignature
    ) external payable nonReentrant {
        require(msg.value > 0, "B402: zero payment");
        require(controller != address(0), "B402: controller not set");
        require(address(teeRegistry) != address(0), "B402: no TEE registry");
        require(block.timestamp <= timestamp + TEE_RECEIPT_VALIDITY, "B402: receipt expired");

        // Build receipt hash for signature verification
        bytes32 receiptHash = keccak256(abi.encodePacked(
            agentId, msg.value, keccak256(bytes(endpoint)), timestamp, logicHash
        ));

        // Replay protection
        require(!usedReceipts[receiptHash], "B402: receipt already used");
        usedReceipts[receiptHash] = true;

        // Verify TEE signature via ecrecover
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", receiptHash));
        address signer = ECDSA.recover(ethSignedHash, teeSignature);
        require(teeRegistry.isTEEAgent(agentId, signer), "B402: invalid TEE receipt");

        // Record verified payment
        payments.push(PaymentRecord({
            payer: msg.sender,
            agentId: agentId,
            endpoint: endpoint,
            token: address(0),
            amount: msg.value,
            timestamp: block.timestamp
        }));
        agentTotalPayments[agentId][address(0)] += msg.value;
        verifiedRevenue[agentId] += msg.value;
        totalVerifiedPayments++;

        // Forward to controller
        (bool sent, ) = controller.call{value: msg.value}(
            abi.encodeWithSignature("receiveB402PaymentBNB(uint256)", agentId)
        );
        require(sent, "B402: forward failed");

        emit VerifiedPaymentReceived(agentId, msg.value, logicHash, signer);
    }

    /**
     * @notice Verify a TEE receipt without payment (for external verification).
     */
    function verifyTEEReceipt(
        uint256 agentId,
        uint256 amount,
        string calldata endpoint,
        uint256 timestamp,
        bytes32 logicHash,
        bytes calldata teeSignature
    ) external view returns (bool valid, address signer) {
        bytes32 receiptHash = keccak256(abi.encodePacked(
            agentId, amount, keccak256(bytes(endpoint)), timestamp, logicHash
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", receiptHash));
        signer = ECDSA.recover(ethSignedHash, teeSignature);
        valid = teeRegistry.isTEEAgent(agentId, signer) && (block.timestamp <= timestamp + TEE_RECEIPT_VALIDITY);
    }

    // -- Admin Functions --

    function setTEERegistry(address _teeRegistry) external onlyOwner {
        teeRegistry = ITEERegistry(_teeRegistry);
        emit TEERegistrySet(_teeRegistry);
    }

    function setTEEVerificationRequired(bool required) external onlyOwner {
        teeVerificationRequired = required;
        emit TEEVerificationSet(required);
    }

    function setController(address _controller) external onlyOwner {
        require(_controller != address(0), "B402: zero address");
        controller = _controller;
        emit ControllerSet(_controller);
    }

    function setAuthorizedRelay(address relay, bool authorized) external onlyOwner {
        require(relay != address(0), "B402: zero address");
        authorizedRelays[relay] = authorized;
        emit RelayAuthorized(relay, authorized);
    }

    function setRelayRestricted(bool restricted) external onlyOwner {
        relayRestricted = restricted;
        emit RelayRestrictionSet(restricted);
    }
}
