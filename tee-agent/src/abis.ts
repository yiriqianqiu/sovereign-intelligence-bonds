export const TEERegistryABI = [
  "function authorizeTEEAgent(uint256 agentId, address teeAddress) external",
  "function pushTEEAttestation(uint256 agentId, bytes32 attestationHash) external",
  "function isTEEAgent(uint256 agentId, address teeAddress) view returns (bool)",
  "function getTEEStatus(uint256 agentId) view returns (address teeAddress, bytes32 lastAttestation, uint256 lastAttestationTime, bool isActive)",
] as const;

export const SIBControllerV2ABI = [
  "function submitSharpeProof(uint256 agentId, bytes calldata proof, uint256[] calldata instances) external",
  "function distributeDividends(uint256 agentId, uint256 classId, uint256 nonce) external payable",
  "function initiateIPO(uint256 agentId, uint256 classId, uint256 totalSupply, uint256 pricePerBond) external",
  "function markBondsRedeemable(uint256 agentId, uint256 classId, uint256 nonce) external",
  "function revenuePool(uint256 agentId, address token) view returns (uint256)",
  "function activeNonce(uint256 agentId, uint256 classId) view returns (uint256)",
  "function getAgentBondClasses(uint256 agentId) view returns (uint256[])",
] as const;

export const B402ReceiverABI = [
  "function payBNB(uint256 agentId, string calldata endpoint) external payable",
  "function payERC20(uint256 agentId, address token, uint256 amount, string calldata endpoint) external",
  "function payWithSignature(address payer, uint256 agentId, address token, uint256 amount, string calldata endpoint, uint256 deadline, bytes calldata signature) external",
] as const;

export const NFARegistryABI = [
  "function getAgentOwner(uint256 agentId) view returns (address)",
  "function getCreditScore(uint256 agentId) view returns (uint256)",
  "function agents(uint256 agentId) view returns (string name, string personality, string vaultURI, uint256 birthBlock, bool active, address logicContract, uint256 totalRevenue, uint256 avgMonthlyRevenue, uint256 revenueCount, uint256 creditScore, bytes32 learningRoot)",
] as const;

export const GreenfieldDataVaultABI = [
  "function registerDataAsset(uint256 agentId, string calldata objectId, bytes32 contentHash, uint256 size) external",
  "function verifyAsset(uint256 agentId, string calldata objectId) external",
  "function getAgentAssets(uint256 agentId) view returns (string[] memory)",
] as const;
