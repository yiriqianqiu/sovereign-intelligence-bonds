export const TEERegistryABI = [
  "function authorizeTEEAgent(uint256 agentId, address teeAddress) external",
  "function pushTEEAttestation(uint256 agentId, bytes32 attestationHash) external",
  "function isTEEAgent(uint256 agentId, address teeAddress) view returns (bool)",
  "function getTEEStatus(uint256 agentId) view returns (address teeAddress, bytes32 lastAttestation, uint256 lastAttestationTime, bool isActive)",
] as const;

export const SIBControllerV2ABI = [
  "function submitSharpeProof(uint256 agentId, bytes calldata proof, uint256[] calldata instances) external",
  "function distributeDividends(uint256 classId, uint256 nonceId) external",
  "function initiateIPO(uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod, uint256 pricePerBond, uint256 maxSupply, address paymentToken) external",
  "function markBondsRedeemable(uint256 classId, uint256 nonceId) external",
  "function revenuePool(uint256 agentId, address token) view returns (uint256)",
  "function activeNonce(uint256 classId) view returns (uint256)",
  "function getAgentBondClasses(uint256 agentId) view returns (uint256[])",
  "function hasIPO(uint256 agentId) view returns (bool)",
  "function releaseIPOCapital(uint256 agentId, address token, uint256 amount) external",
  "function ipoCapital(uint256 agentId, address token) view returns (uint256)",
] as const;

export const B402ReceiverABI = [
  "function payBNB(uint256 agentId, string calldata endpoint) external payable",
  "function payBNBVerified(uint256 agentId, string calldata endpoint, uint256 timestamp, bytes32 logicHash, bytes calldata teeSignature) external payable",
  "function payERC20(uint256 agentId, address token, uint256 amount, string calldata endpoint) external",
  "function verifyTEEReceipt(uint256 agentId, uint256 amount, string calldata endpoint, uint256 timestamp, bytes32 logicHash, bytes calldata teeSignature) view returns (bool valid, address signer)",
  "function verifiedRevenue(uint256 agentId) view returns (uint256)",
  "function totalVerifiedPayments() view returns (uint256)",
  "function getPaymentCount() view returns (uint256)",
  "function agentTotalPayments(uint256 agentId, address token) view returns (uint256)",
] as const;

export const NFARegistryABI = [
  "function registerAgent(string calldata name, string calldata description, string calldata modelHash, string calldata endpoint) external returns (uint256 agentId)",
  "function updateState(uint256 agentId, uint8 newState) external",
  "function getAgentOwner(uint256 agentId) view returns (address)",
  "function getAgentState(uint256 agentId) view returns (uint8)",
  "function getAgentMetadata(uint256 agentId) view returns (string name, string description, string modelHash, string endpoint, uint256 registeredAt)",
  "function creditRatings(uint256 agentId) view returns (uint8)",
  "function totalSupply() view returns (uint256)",
] as const;

export const GreenfieldDataVaultABI = [
  "function registerDataAsset(uint256 agentId, string calldata bucketName, string calldata objectName, bytes32 contentHash, uint8 dataType, uint256 size) external returns (uint256 assetId)",
  "function verifyAsset(uint256 assetId) external",
  "function getAgentAssets(uint256 agentId) view returns (uint256[] memory)",
] as const;

export const ComputeMarketplaceABI = [
  "function rentComputeBNB(uint256 agentId, uint256 resourceId, uint256 units, uint256 durationHours) external payable returns (uint256 rentalId)",
  "function endRental(uint256 rentalId) external",
  "function resources(uint256) view returns (address,string,string,uint8,uint256,address,uint8,uint8,uint256,uint256,bool)",
  "function getAgentRentals(uint256 agentId) view returns (uint256[])",
  "function rentals(uint256) view returns (uint256,uint256,uint256,uint256,uint256,uint256,address,bool,bool)",
  "function isEligible(uint256 agentId, uint256 resourceId) view returns (bool)",
  "function getActiveRentalCount(uint256 agentId) view returns (uint256)",
] as const;
