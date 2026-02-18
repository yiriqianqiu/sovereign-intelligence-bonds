// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface INFARegistryForCompute {
    function getAgentOwner(uint256 agentId) external view returns (address);
    function getAgentState(uint256 agentId) external view returns (uint8);
    function creditRatings(uint256 agentId) external view returns (uint8);
    function evolutionLevel(uint256 agentId) external view returns (uint8);
}

interface ITokenRegistryForCompute {
    function isTokenSupported(address token) external view returns (bool);
}

interface ITEERegistryForCompute {
    function isTEEAgent(uint256 agentId, address candidate) external view returns (bool);
}

/**
 * @title ComputeMarketplace
 * @notice DePIN compute rental marketplace gated by NFA credit rating.
 *         Compute providers register resources with minimum credit requirements.
 *         Agents rent compute based on their credit/evolution level.
 *         Higher credit = access to more powerful resources.
 */
contract ComputeMarketplace is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum ResourceType { CPU, GPU, TPU, Memory, Storage }

    struct ComputeResource {
        address provider;
        string name;
        string specs;              // hardware specs description
        ResourceType resourceType;
        uint256 pricePerHour;      // smallest unit per hour
        address paymentToken;      // address(0) = BNB
        uint8 minCreditRating;     // 0=any, 1=C, 2=B, 3=A, 4=AA, 5=AAA
        uint8 minEvolutionLevel;   // 0=any, 1-5 required
        uint256 totalCapacity;     // units available
        uint256 usedCapacity;
        bool active;
    }

    struct Rental {
        uint256 agentId;
        uint256 resourceId;
        uint256 startTime;
        uint256 duration;          // rented hours
        uint256 unitsRented;
        uint256 depositAmount;
        address paymentToken;
        bool active;
        bool settled;              // payment claimed by provider
    }

    INFARegistryForCompute public nfaRegistry;
    ITokenRegistryForCompute public tokenRegistry;
    ITEERegistryForCompute public teeRegistry;

    uint256 public protocolFeeBps = 250; // 2.5%
    uint256 public constant MAX_FEE_BPS = 1000; // 10%
    uint256 public accumulatedFees; // BNB fees
    mapping(address => uint256) public accumulatedTokenFees; // ERC-20 fees

    uint256 private _nextResourceId = 1;
    uint256 private _nextRentalId = 1;

    mapping(uint256 => ComputeResource) public resources;
    mapping(uint256 => Rental) public rentals;
    mapping(uint256 => uint256[]) public agentRentals;
    mapping(address => uint256[]) public providerResources;

    event ResourceRegistered(
        uint256 indexed resourceId,
        address indexed provider,
        string name,
        ResourceType resourceType,
        uint256 pricePerHour,
        address paymentToken,
        uint8 minCreditRating,
        uint8 minEvolutionLevel,
        uint256 totalCapacity
    );
    event ResourceUpdated(uint256 indexed resourceId);
    event ResourceDeactivated(uint256 indexed resourceId);
    event ComputeRented(
        uint256 indexed rentalId,
        uint256 indexed agentId,
        uint256 indexed resourceId,
        uint256 units,
        uint256 duration,
        uint256 totalCost
    );
    event RentalEnded(uint256 indexed rentalId, uint256 refundAmount);
    event PaymentClaimed(uint256 indexed rentalId, uint256 providerAmount, uint256 protocolFee);
    event TEERegistrySet(address indexed teeRegistry);

    constructor(address _nfaRegistry, address _tokenRegistry) Ownable(msg.sender) {
        require(_nfaRegistry != address(0), "ComputeMarketplace: zero registry");
        require(_tokenRegistry != address(0), "ComputeMarketplace: zero tokenRegistry");
        nfaRegistry = INFARegistryForCompute(_nfaRegistry);
        tokenRegistry = ITokenRegistryForCompute(_tokenRegistry);
    }

    // -- Provider Functions --

    function registerResource(
        string calldata name,
        string calldata specs,
        ResourceType resourceType,
        uint256 pricePerHour,
        address paymentToken,
        uint8 minCreditRating,
        uint8 minEvolutionLevel,
        uint256 totalCapacity
    ) external returns (uint256 resourceId) {
        require(bytes(name).length > 0, "ComputeMarketplace: empty name");
        require(pricePerHour > 0, "ComputeMarketplace: zero price");
        require(totalCapacity > 0, "ComputeMarketplace: zero capacity");
        require(minCreditRating <= 5, "ComputeMarketplace: invalid rating");
        require(minEvolutionLevel <= 5, "ComputeMarketplace: invalid level");
        require(
            paymentToken == address(0) || tokenRegistry.isTokenSupported(paymentToken),
            "ComputeMarketplace: unsupported token"
        );

        resourceId = _nextResourceId++;

        resources[resourceId] = ComputeResource({
            provider: msg.sender,
            name: name,
            specs: specs,
            resourceType: resourceType,
            pricePerHour: pricePerHour,
            paymentToken: paymentToken,
            minCreditRating: minCreditRating,
            minEvolutionLevel: minEvolutionLevel,
            totalCapacity: totalCapacity,
            usedCapacity: 0,
            active: true
        });

        providerResources[msg.sender].push(resourceId);

        emit ResourceRegistered(
            resourceId, msg.sender, name, resourceType,
            pricePerHour, paymentToken, minCreditRating, minEvolutionLevel, totalCapacity
        );
    }

    function updateResourcePrice(uint256 resourceId, uint256 newPrice) external {
        ComputeResource storage res = resources[resourceId];
        require(res.provider == msg.sender, "ComputeMarketplace: not provider");
        require(res.active, "ComputeMarketplace: not active");
        require(newPrice > 0, "ComputeMarketplace: zero price");

        res.pricePerHour = newPrice;
        emit ResourceUpdated(resourceId);
    }

    function deactivateResource(uint256 resourceId) external {
        ComputeResource storage res = resources[resourceId];
        require(
            res.provider == msg.sender || msg.sender == owner(),
            "ComputeMarketplace: not authorized"
        );
        require(res.active, "ComputeMarketplace: not active");

        res.active = false;
        emit ResourceDeactivated(resourceId);
    }

    // -- Agent Functions (credit-gated) --

    function rentComputeBNB(
        uint256 agentId,
        uint256 resourceId,
        uint256 units,
        uint256 durationHours
    ) external payable nonReentrant returns (uint256 rentalId) {
        ComputeResource storage res = resources[resourceId];
        require(res.paymentToken == address(0), "ComputeMarketplace: not BNB resource");

        uint256 totalCost = res.pricePerHour * units * durationHours;
        require(msg.value >= totalCost, "ComputeMarketplace: insufficient BNB");

        rentalId = _createRental(agentId, resourceId, units, durationHours, totalCost, address(0));

        if (msg.value > totalCost) {
            (bool sent,) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(sent, "ComputeMarketplace: refund failed");
        }
    }

    function rentComputeERC20(
        uint256 agentId,
        uint256 resourceId,
        uint256 units,
        uint256 durationHours
    ) external nonReentrant returns (uint256 rentalId) {
        ComputeResource storage res = resources[resourceId];
        require(res.paymentToken != address(0), "ComputeMarketplace: not ERC20 resource");

        uint256 totalCost = res.pricePerHour * units * durationHours;
        IERC20(res.paymentToken).safeTransferFrom(msg.sender, address(this), totalCost);

        rentalId = _createRental(agentId, resourceId, units, durationHours, totalCost, res.paymentToken);
    }

    function _createRental(
        uint256 agentId,
        uint256 resourceId,
        uint256 units,
        uint256 durationHours,
        uint256 totalCost,
        address paymentToken
    ) internal returns (uint256 rentalId) {
        require(
            nfaRegistry.getAgentOwner(agentId) == msg.sender ||
            (address(teeRegistry) != address(0) && teeRegistry.isTEEAgent(agentId, msg.sender)),
            "ComputeMarketplace: not authorized"
        );
        require(nfaRegistry.getAgentState(agentId) == 1, "ComputeMarketplace: agent not active");
        require(units > 0 && durationHours > 0, "ComputeMarketplace: zero units or hours");

        ComputeResource storage res = resources[resourceId];
        require(res.active, "ComputeMarketplace: resource not active");
        require(res.usedCapacity + units <= res.totalCapacity, "ComputeMarketplace: insufficient capacity");

        // Credit gate check
        uint8 agentCredit = nfaRegistry.creditRatings(agentId);
        require(agentCredit >= res.minCreditRating, "ComputeMarketplace: insufficient credit rating");

        // Evolution level gate check
        uint8 agentLevel = nfaRegistry.evolutionLevel(agentId);
        require(agentLevel >= res.minEvolutionLevel, "ComputeMarketplace: insufficient evolution level");

        res.usedCapacity += units;
        rentalId = _nextRentalId++;

        rentals[rentalId] = Rental({
            agentId: agentId,
            resourceId: resourceId,
            startTime: block.timestamp,
            duration: durationHours,
            unitsRented: units,
            depositAmount: totalCost,
            paymentToken: paymentToken,
            active: true,
            settled: false
        });

        agentRentals[agentId].push(rentalId);

        emit ComputeRented(rentalId, agentId, resourceId, units, durationHours, totalCost);
    }

    function endRental(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(rental.active, "ComputeMarketplace: rental not active");
        require(
            nfaRegistry.getAgentOwner(rental.agentId) == msg.sender ||
            resources[rental.resourceId].provider == msg.sender ||
            msg.sender == owner() ||
            (address(teeRegistry) != address(0) && teeRegistry.isTEEAgent(rental.agentId, msg.sender)),
            "ComputeMarketplace: not authorized"
        );

        rental.active = false;

        ComputeResource storage res = resources[rental.resourceId];
        res.usedCapacity -= rental.unitsRented;

        // Calculate used time and refund
        uint256 elapsedHours = (block.timestamp - rental.startTime) / 3600;
        if (elapsedHours > rental.duration) elapsedHours = rental.duration;

        uint256 usedCost = (rental.depositAmount * elapsedHours) / rental.duration;
        uint256 refundAmount = rental.depositAmount - usedCost;

        // Refund unused portion to agent owner
        if (refundAmount > 0) {
            address agentOwner = nfaRegistry.getAgentOwner(rental.agentId);
            if (rental.paymentToken == address(0)) {
                (bool sent,) = payable(agentOwner).call{value: refundAmount}("");
                require(sent, "ComputeMarketplace: refund failed");
            } else {
                IERC20(rental.paymentToken).safeTransfer(agentOwner, refundAmount);
            }
        }

        // Update deposit to reflect used amount only
        rental.depositAmount = usedCost;

        emit RentalEnded(rentalId, refundAmount);
    }

    function claimPayment(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(!rental.active, "ComputeMarketplace: rental still active");
        require(!rental.settled, "ComputeMarketplace: already settled");

        ComputeResource storage res = resources[rental.resourceId];
        require(res.provider == msg.sender, "ComputeMarketplace: not provider");

        rental.settled = true;

        uint256 amount = rental.depositAmount;
        uint256 fee = (amount * protocolFeeBps) / 10000;
        uint256 providerAmount = amount - fee;

        if (rental.paymentToken == address(0)) {
            accumulatedFees += fee;
            (bool sent,) = payable(msg.sender).call{value: providerAmount}("");
            require(sent, "ComputeMarketplace: payment failed");
        } else {
            accumulatedTokenFees[rental.paymentToken] += fee;
            IERC20(rental.paymentToken).safeTransfer(msg.sender, providerAmount);
        }

        emit PaymentClaimed(rentalId, providerAmount, fee);
    }

    // -- Admin --

    function setTEERegistry(address _teeRegistry) external onlyOwner {
        teeRegistry = ITEERegistryForCompute(_teeRegistry);
        emit TEERegistrySet(_teeRegistry);
    }

    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "ComputeMarketplace: fee too high");
        protocolFeeBps = newFeeBps;
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = accumulatedFees;
        if (amount > 0) {
            accumulatedFees = 0;
            (bool sent,) = payable(owner()).call{value: amount}("");
            require(sent, "ComputeMarketplace: withdraw failed");
        }
    }

    function withdrawTokenFees(address token) external onlyOwner {
        uint256 amount = accumulatedTokenFees[token];
        if (amount > 0) {
            accumulatedTokenFees[token] = 0;
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    // -- View Functions --

    function getAgentRentals(uint256 agentId) external view returns (uint256[] memory) {
        return agentRentals[agentId];
    }

    function getProviderResources(address provider) external view returns (uint256[] memory) {
        return providerResources[provider];
    }

    function getActiveRentalCount(uint256 agentId) external view returns (uint256 count) {
        uint256[] storage ids = agentRentals[agentId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (rentals[ids[i]].active) count++;
        }
    }

    function isEligible(uint256 agentId, uint256 resourceId) external view returns (bool) {
        ComputeResource storage res = resources[resourceId];
        if (!res.active) return false;
        uint8 credit = nfaRegistry.creditRatings(agentId);
        uint8 level = nfaRegistry.evolutionLevel(agentId);
        return credit >= res.minCreditRating && level >= res.minEvolutionLevel;
    }

    receive() external payable {}
}
