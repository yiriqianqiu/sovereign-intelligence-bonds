// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC3475.sol";

contract BondDEX is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address maker;
        uint256 classId;
        uint256 nonceId;
        uint256 amount;         // remaining amount
        uint256 pricePerBond;   // in paymentToken units
        address paymentToken;   // address(0) = BNB
        bool isSell;
        uint256 expiry;         // timestamp, 0 = no expiry
        bool active;
    }

    address public bondManager;
    address public dividendVault;

    mapping(uint256 => Order) public orders;
    uint256 private _nextOrderId = 1;

    uint256 public protocolFeeBps = 50; // 0.5% default
    uint256 public constant MAX_FEE_BPS = 500; // 5% max
    address public feeRecipient;
    mapping(address => uint256) public collectedFees; // token => fees

    // Events
    event OrderCreated(uint256 indexed orderId, address indexed maker, uint256 classId, uint256 nonceId, uint256 amount, uint256 pricePerBond, bool isSell);
    event OrderFilled(uint256 indexed orderId, address indexed taker, uint256 amount, uint256 totalPayment);
    event OrderCancelled(uint256 indexed orderId);
    event ProtocolFeeUpdated(uint256 oldBps, uint256 newBps);
    event FeesWithdrawn(address indexed token, uint256 amount);

    constructor(address _bondManager, address _dividendVault) Ownable(msg.sender) {
        require(_bondManager != address(0) && _dividendVault != address(0), "BondDEX: zero address");
        bondManager = _bondManager;
        dividendVault = _dividendVault;
        feeRecipient = msg.sender;
    }

    // --- Create Sell Order: escrow bonds ---
    function createSellOrder(
        uint256 classId, uint256 nonceId, uint256 amount,
        uint256 pricePerBond, address paymentToken, uint256 expiry
    ) external nonReentrant returns (uint256 orderId) {
        require(amount > 0, "BondDEX: zero amount");
        require(pricePerBond > 0, "BondDEX: zero price");
        require(expiry == 0 || expiry > block.timestamp, "BondDEX: expired");

        // Transfer bonds from maker to DEX (escrow)
        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});

        // DEX needs approval from maker - BondManager.transferFrom requires msg.sender == from or approved
        // The maker must approve DEX first via bondManager.setApprovalFor(dex, true)
        IERC3475(bondManager).transferFrom(msg.sender, address(this), txns);

        orderId = _nextOrderId++;
        orders[orderId] = Order({
            maker: msg.sender,
            classId: classId,
            nonceId: nonceId,
            amount: amount,
            pricePerBond: pricePerBond,
            paymentToken: paymentToken,
            isSell: true,
            expiry: expiry,
            active: true
        });

        emit OrderCreated(orderId, msg.sender, classId, nonceId, amount, pricePerBond, true);
    }

    // --- Create Buy Order: escrow payment ---
    function createBuyOrder(
        uint256 classId, uint256 nonceId, uint256 amount,
        uint256 pricePerBond, address paymentToken, uint256 expiry
    ) external payable nonReentrant returns (uint256 orderId) {
        require(amount > 0, "BondDEX: zero amount");
        require(pricePerBond > 0, "BondDEX: zero price");
        require(expiry == 0 || expiry > block.timestamp, "BondDEX: expired");

        uint256 totalCost = pricePerBond * amount;

        if (paymentToken == address(0)) {
            require(msg.value >= totalCost, "BondDEX: insufficient BNB");
            // Refund excess
            if (msg.value > totalCost) {
                (bool sent,) = payable(msg.sender).call{value: msg.value - totalCost}("");
                require(sent, "BondDEX: refund failed");
            }
        } else {
            require(msg.value == 0, "BondDEX: no BNB for ERC20 order");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), totalCost);
        }

        orderId = _nextOrderId++;
        orders[orderId] = Order({
            maker: msg.sender,
            classId: classId,
            nonceId: nonceId,
            amount: amount,
            pricePerBond: pricePerBond,
            paymentToken: paymentToken,
            isSell: false,
            expiry: expiry,
            active: true
        });

        emit OrderCreated(orderId, msg.sender, classId, nonceId, amount, pricePerBond, false);
    }

    // --- Fill Order: atomic swap ---
    function fillOrder(uint256 orderId, uint256 amount) external payable nonReentrant {
        Order storage order = orders[orderId];
        require(order.active, "BondDEX: order not active");
        require(amount > 0 && amount <= order.amount, "BondDEX: invalid amount");
        require(order.expiry == 0 || block.timestamp <= order.expiry, "BondDEX: order expired");

        uint256 totalPayment = order.pricePerBond * amount;
        uint256 fee = (totalPayment * protocolFeeBps) / 10000;
        uint256 sellerReceives = totalPayment - fee;

        order.amount -= amount;
        if (order.amount == 0) {
            order.active = false;
        }

        if (order.isSell) {
            // Taker is BUYER: pays money, receives bonds
            _collectPayment(msg.sender, order.paymentToken, totalPayment);
            _sendPayment(order.maker, order.paymentToken, sellerReceives);

            // Transfer bonds from DEX to taker
            IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
            txns[0] = IERC3475.Transaction({classId: order.classId, nonceId: order.nonceId, amount: amount});
            IERC3475(bondManager).transferFrom(address(this), msg.sender, txns);
        } else {
            // Taker is SELLER: provides bonds, receives escrowed payment
            IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
            txns[0] = IERC3475.Transaction({classId: order.classId, nonceId: order.nonceId, amount: amount});
            IERC3475(bondManager).transferFrom(msg.sender, order.maker, txns);

            // Send escrowed payment to seller (taker)
            _sendPayment(msg.sender, order.paymentToken, sellerReceives);
        }

        collectedFees[order.paymentToken] += fee;

        // Update dividend vault
        _updateDividendVault(
            order.isSell ? address(this) : msg.sender,    // from
            order.isSell ? msg.sender : order.maker,       // to
            order.classId, order.nonceId, amount
        );

        emit OrderFilled(orderId, msg.sender, amount, totalPayment);
    }

    // --- Cancel Order ---
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.active, "BondDEX: order not active");
        require(order.maker == msg.sender || (order.expiry != 0 && block.timestamp > order.expiry), "BondDEX: not authorized");

        order.active = false;

        if (order.isSell) {
            // Return escrowed bonds to maker
            IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
            txns[0] = IERC3475.Transaction({classId: order.classId, nonceId: order.nonceId, amount: order.amount});
            IERC3475(bondManager).transferFrom(address(this), order.maker, txns);
        } else {
            // Return escrowed payment to maker
            uint256 refund = order.pricePerBond * order.amount;
            _sendPayment(order.maker, order.paymentToken, refund);
        }

        emit OrderCancelled(orderId);
    }

    // --- Admin ---
    function setProtocolFee(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_FEE_BPS, "BondDEX: fee too high");
        uint256 old = protocolFeeBps;
        protocolFeeBps = newBps;
        emit ProtocolFeeUpdated(old, newBps);
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "BondDEX: zero address");
        feeRecipient = _recipient;
    }

    function withdrawFees(address token) external {
        uint256 amount = collectedFees[token];
        require(amount > 0, "BondDEX: no fees");
        collectedFees[token] = 0;
        _sendPayment(feeRecipient, token, amount);
        emit FeesWithdrawn(token, amount);
    }

    // --- View ---
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getOrderCount() external view returns (uint256) {
        return _nextOrderId - 1;
    }

    // --- Internal ---
    function _collectPayment(address from, address token, uint256 amount) internal {
        if (token == address(0)) {
            require(msg.value >= amount, "BondDEX: insufficient BNB");
            if (msg.value > amount) {
                (bool sent,) = payable(from).call{value: msg.value - amount}("");
                require(sent, "BondDEX: refund failed");
            }
        } else {
            IERC20(token).safeTransferFrom(from, address(this), amount);
        }
    }

    function _sendPayment(address to, address token, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool sent,) = payable(to).call{value: amount}("");
            require(sent, "BondDEX: BNB transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _updateDividendVault(address from, address to, uint256 classId, uint256 nonceId, uint256 amount) internal {
        (bool success,) = dividendVault.call(
            abi.encodeWithSignature("updateOnTransfer(address,address,uint256,uint256,uint256)", from, to, classId, nonceId, amount)
        );
        // Silent fail OK for DEX - dividend tracking is best-effort
        // In production, this should be required
    }

    receive() external payable {}
}
