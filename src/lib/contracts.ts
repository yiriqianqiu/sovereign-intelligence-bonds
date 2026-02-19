// Human-readable ABIs for wagmi/viem
// NOTE: abitype@1.2.3 does NOT support named tuple members -- use positional types only

export const NFARegistryABI = [
  "function registerAgent(string, string, string, string) returns (uint256)",
  "function updateState(uint256 agentId, uint8 newState)",
  "function fundAgent(uint256 agentId) payable",
  "function withdrawAgentFunds(uint256 agentId, uint256 amount)",
  "function getAgentMetadata(uint256 agentId) view returns (string, string, string, string, uint256)",
  "function getAgentState(uint256 agentId) view returns (uint8)",
  "function getAgentOwner(uint256 agentId) view returns (address)",
  "function getRevenueProfile(uint256 agentId) view returns (uint256, uint256, uint256, uint256, bytes32)",
  "function creditRatings(uint256 agentId) view returns (uint8)",
  "function getAgentBalance(uint256 agentId) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
  "event AgentStateChanged(uint256 indexed agentId, uint8 newState)",
  "event RevenueRecorded(uint256 indexed agentId, uint256 amount, uint256 totalEarned)",
  "event SharpeUpdated(uint256 indexed agentId, uint256 sharpeRatio, bytes32 proofHash)",
  "event CreditRatingUpdated(uint256 indexed agentId, uint8 rating)",
] as const;

export const SIBBondManagerABI = [
  "function bondClasses(uint256 classId) view returns (uint256, uint256, uint256, uint256, uint256, bool)",
  "function bondNonces(uint256 classId, uint256 nonceId) view returns (uint256, uint256, uint256, uint256, bool, bool)",
  "function balanceOf(address account, uint256 classId, uint256 nonceId) view returns (uint256)",
  "function totalSupply(uint256 classId, uint256 nonceId) view returns (uint256)",
  "function classMetadata(uint256 metadataId) view returns (string, string, string)",
  "function classValues(uint256 classId, uint256 metadataId) view returns (string, uint256, address, bool)",
  "function nextNonceId(uint256 classId) view returns (uint256)",
  "function setApprovalFor(address operator, bool approved)",
  "function isApprovedFor(address owner, address operator) view returns (bool)",
  "function transferFrom(address from, address to, (uint256, uint256, uint256)[] transactions)",
  "event Issue(address indexed operator, address indexed to, (uint256, uint256, uint256)[] transactions)",
  "event Transfer(address indexed operator, address indexed from, address indexed to, (uint256, uint256, uint256)[] transactions)",
  "event BondClassCreated(uint256 indexed classId, uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod, uint256 sharpeRatioAtIssue, uint256 maxSupply)",
  "event BondNonceCreated(uint256 indexed classId, uint256 indexed nonceId, uint256 pricePerBond)",
] as const;

export const SIBControllerABI = [
  "function initiateIPO(uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod, uint256 pricePerBond, uint256 maxSupply)",
  "function purchaseBonds(uint256 classId, uint256 amount) payable",
  "function transferBonds(address to, uint256 classId, uint256 nonceId, uint256 amount)",
  "function receiveX402Payment(uint256 agentId) payable",
  "function distributeDividends(uint256 classId, uint256 nonceId)",
  "function submitSharpeProof(uint256 agentId, bytes proof, uint256[] instances)",
  "function redeemBonds(uint256 classId, uint256 nonceId, uint256 amount)",
  "function markBondsRedeemable(uint256 classId, uint256 nonceId)",
  "function hasIPO(uint256 agentId) view returns (bool)",
  "function revenuePool(uint256 agentId) view returns (uint256)",
  "function bondholderShareBps() view returns (uint256)",
  "function activeNonce(uint256 classId) view returns (uint256)",
  "function agentBondClass(uint256 agentId) view returns (uint256)",
  "function paused() view returns (bool)",
  "event IPOInitiated(uint256 indexed agentId, uint256 indexed classId, uint256 nonceId, uint256 couponRateBps, uint256 pricePerBond)",
  "event BondsPurchased(address indexed buyer, uint256 indexed classId, uint256 nonceId, uint256 amount, uint256 totalCost)",
  "event X402RevenueReceived(uint256 indexed agentId, uint256 amount, uint256 bondholderShare, uint256 ownerShare)",
  "event SharpeProofVerified(uint256 indexed agentId, uint256 sharpeRatio, bytes32 proofHash)",
  "event DividendsDistributed(uint256 indexed classId, uint256 nonceId, uint256 amount)",
  "event BondsRedeemed(address indexed holder, uint256 indexed classId, uint256 nonceId, uint256 amount)",
] as const;

export const DividendVaultABI = [
  "function claimable(address holder, uint256 classId, uint256 nonceId) view returns (uint256)",
  "function claim(uint256 classId, uint256 nonceId)",
  "function classAccDividendPerBond(uint256 classId) view returns (uint256)",
  "function classTotalDeposited(uint256 classId) view returns (uint256)",
  "event DividendClaimed(address indexed holder, uint256 indexed classId, uint256 indexed nonceId, uint256 amount)",
] as const;

export const X402PaymentReceiverABI = [
  "function pay(uint256 agentId, string endpoint) payable",
  "function getPaymentCount() view returns (uint256)",
  "function getPayment(uint256 index) view returns (address, uint256, string, uint256, uint256)",
  "function agentTotalPayments(uint256 agentId) view returns (uint256)",
  "event PaymentReceived(address indexed payer, uint256 indexed agentId, string endpoint, uint256 amount)",
] as const;

export const B402PaymentReceiverABI = [
  "function payBNB(uint256 agentId, string endpoint) payable",
  "function payBNBVerified(uint256 agentId, string endpoint, uint256 timestamp, bytes32 logicHash, bytes teeSignature) payable",
  "function payERC20(uint256 agentId, address token, uint256 amount, string endpoint)",
  "function payWithSignature(address payer, uint256 agentId, address token, uint256 amount, string endpoint, uint256 deadline, bytes signature)",
  "function verifyTEEReceipt(uint256 agentId, uint256 amount, string endpoint, uint256 timestamp, bytes32 logicHash, bytes teeSignature) view returns (bool valid, address signer)",
  "function getPaymentCount() view returns (uint256)",
  "function agentTotalPayments(uint256 agentId, address token) view returns (uint256)",
  "function verifiedRevenue(uint256 agentId) view returns (uint256)",
  "function totalVerifiedPayments() view returns (uint256)",
  "function teeVerificationRequired() view returns (bool)",
  "function nonces(address payer) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function relayRestricted() view returns (bool)",
  "function authorizedRelays(address relay) view returns (bool)",
  "event PaymentReceived(address indexed payer, uint256 indexed agentId, address indexed token, string endpoint, uint256 amount)",
  "event SignedPaymentReceived(address indexed payer, uint256 indexed agentId, address indexed token, string endpoint, uint256 amount, address relayer)",
  "event VerifiedPaymentReceived(uint256 indexed agentId, uint256 amount, bytes32 logicHash, address indexed teeWallet)",
] as const;

// ============================================================
// v2 ABIs
// ============================================================

export const SIBBondManagerV2ABI = [
  "function bondClasses(uint256 classId) view returns (uint256, uint256, uint256, uint256, uint256, uint8, address, bool)",
  "function bondNonces(uint256 classId, uint256 nonceId) view returns (uint256, uint256, uint256, uint256, bool, bool)",
  "function balanceOf(address account, uint256 classId, uint256 nonceId) view returns (uint256)",
  "function totalSupply(uint256 classId, uint256 nonceId) view returns (uint256)",
  "function nextNonceId(uint256 classId) view returns (uint256)",
  "function getAgentClassIds(uint256 agentId) view returns (uint256[])",
  "function getClassesByTranche(uint256 agentId, uint8 tranche) view returns (uint256[])",
  "function setApprovalFor(address operator, bool approved)",
  "function isApprovedFor(address owner, address operator) view returns (bool)",
  "function transferFrom(address from, address to, (uint256, uint256, uint256)[] transactions)",
  "event BondClassCreated(uint256 indexed classId, uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod, uint256 sharpeRatioAtIssue, uint256 maxSupply)",
] as const;

export const SIBControllerV2ABI = [
  "function initiateIPO(uint256 agentId, uint256 couponRateBps, uint256 maturityPeriod, uint256 pricePerBond, uint256 maxSupply, address paymentToken)",
  "function initiateTranchedIPO(uint256 agentId, uint256 seniorCouponBps, uint256 juniorCouponBps, uint256 maturityPeriod, uint256 seniorMaxSupply, uint256 juniorMaxSupply, address paymentToken, uint256 seniorPricePerBond, uint256 juniorPricePerBond)",
  "function purchaseBondsBNB(uint256 classId, uint256 amount) payable",
  "function purchaseBondsERC20(uint256 classId, uint256 amount)",
  "function receiveB402PaymentBNB(uint256 agentId) payable",
  "function distributeDividends(uint256 classId, uint256 nonceId)",
  "function submitSharpeProof(uint256 agentId, bytes proof, uint256[] instances)",
  "function redeemBonds(uint256 classId, uint256 nonceId, uint256 amount)",
  "function markBondsRedeemable(uint256 classId, uint256 nonceId)",
  "function transferBonds(address to, uint256 classId, uint256 nonceId, uint256 amount)",
  "function calculateDynamicCoupon(uint256 classId) view returns (uint256)",
  "function activeNonce(uint256 classId) view returns (uint256)",
  "function bondholderShareBps() view returns (uint256)",
  "function getAgentBondClasses(uint256 agentId) view returns (uint256[])",
  "function hasIPO(uint256 agentId) view returns (bool)",
  "function revenuePool(uint256 agentId, address token) view returns (uint256)",
  "function releaseIPOCapital(uint256 agentId, address token, uint256 amount)",
  "function ipoCapital(uint256 agentId, address token) view returns (uint256)",
  "function paused() view returns (bool)",
  "event IPOInitiated(uint256 indexed agentId, uint256 indexed classId, uint256 nonceId, uint256 couponRateBps, uint256 pricePerBond, address paymentToken)",
  "event BondsPurchased(address indexed buyer, uint256 indexed classId, uint256 nonceId, uint256 amount, uint256 totalCost, address paymentToken)",
  "event IPOCapitalReleased(uint256 indexed agentId, address indexed token, uint256 amount, address indexed recipient)",
] as const;

export const DividendVaultV2ABI = [
  "function claimable(address holder, uint256 classId, uint256 nonceId, address token) view returns (uint256)",
  "function claim(uint256 classId, uint256 nonceId, address token)",
  "function claimAll(uint256 classId, uint256 nonceId)",
  "function accDividendPerBond(uint256 classId, uint256 nonceId, address token) view returns (uint256)",
  "function totalDeposited(uint256 classId, uint256 nonceId, address token) view returns (uint256)",
  "function getDepositedTokens(uint256 classId, uint256 nonceId) view returns (address[])",
  "event DividendClaimed(address indexed holder, uint256 indexed classId, uint256 indexed nonceId, address token, uint256 amount)",
] as const;

export const TokenRegistryABI = [
  "function isTokenSupported(address token) view returns (bool)",
  "function getTokenInfo(address token) view returns (string, uint8, uint256, bool, uint256)",
  "function getTokenPrice(address token) view returns (uint256)",
  "function getAllTokens() view returns (address[])",
] as const;

export const BondDEXABI = [
  "function createSellOrder(uint256 classId, uint256 nonceId, uint256 amount, uint256 pricePerBond, address paymentToken, uint256 expiry) returns (uint256)",
  "function createBuyOrder(uint256 classId, uint256 nonceId, uint256 amount, uint256 pricePerBond, address paymentToken, uint256 expiry) payable returns (uint256)",
  "function fillOrder(uint256 orderId, uint256 amount) payable",
  "function cancelOrder(uint256 orderId)",
  "function getOrder(uint256 orderId) view returns (address, uint256, uint256, uint256, uint256, address, bool, uint256, bool)",
  "function getOrderCount() view returns (uint256)",
  "function protocolFeeBps() view returns (uint256)",
  "event OrderCreated(uint256 indexed orderId, address indexed maker, uint256 classId, uint256 nonceId, uint256 amount, uint256 pricePerBond, bool isSell)",
  "event OrderFilled(uint256 indexed orderId, address indexed taker, uint256 amount, uint256 totalPayment)",
  "event OrderCancelled(uint256 indexed orderId)",
] as const;

export const TranchingEngineABI = [
  "function trancheGroups(uint256 groupId) view returns (uint256, uint256, uint256, uint256, uint256, address, bool)",
  "function classToGroup(uint256 classId) view returns (uint256)",
  "function isTranchedClass(uint256 classId) view returns (bool)",
  "function getCounterpartClass(uint256 classId) view returns (uint256)",
  "function getGroupCount() view returns (uint256)",
  "function calculateSeniorEntitlement(uint256 groupId, uint256 seniorNonceId, uint256 timeDelta) view returns (uint256)",
] as const;

export const BondholderGovernorABI = [
  "function createProposal(uint256 classId, uint8 proposalType, uint256 newValue) returns (uint256)",
  "function vote(uint256 proposalId, bool support)",
  "function executeProposal(uint256 proposalId)",
  "function getProposal(uint256 proposalId) view returns (uint256, uint8, uint256, uint256, uint256, uint256, uint256, uint8, address)",
  "function getProposalCount() view returns (uint256)",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function quorumBps() view returns (uint256)",
  "function votingPeriod() view returns (uint256)",
  "event ProposalCreated(uint256 indexed proposalId, uint256 classId, uint8 proposalType, uint256 newValue, address proposer)",
  "event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)",
  "event ProposalExecuted(uint256 indexed proposalId)",
] as const;

export const LiquidationEngineABI = [
  "function liquidations(uint256 agentId) view returns (uint256, uint256, uint256, bool, bool)",
  "function isUnderLiquidation(uint256 agentId) view returns (bool)",
  "function gracePeriod() view returns (uint256)",
  "function triggerLiquidation(uint256 agentId)",
  "function executeLiquidation(uint256 agentId)",
  "event LiquidationTriggered(uint256 indexed agentId, uint256 gracePeriodEnd)",
  "event LiquidationExecuted(uint256 indexed agentId)",
] as const;

export const AutoCompoundVaultABI = [
  "function deposit(uint256 classId, uint256 nonceId, uint256 amount)",
  "function withdraw(uint256 classId, uint256 nonceId, uint256 amount)",
  "function compound(uint256 classId, uint256 nonceId, uint256 pricePerBond)",
  "function balanceOf(address user, uint256 classId, uint256 nonceId) view returns (uint256)",
  "function totalDeposits(uint256 classId, uint256 nonceId) view returns (uint256)",
] as const;

export const IndexBondABI = [
  "function getIndex(uint256 indexId) view returns (string, uint256[], uint256[], uint256[], bool)",
  "function getIndexCount() view returns (uint256)",
  "function mintIndex(uint256 indexId, uint256 shares) payable",
  "function redeemIndex(uint256 indexId, uint256 shares)",
  "function userShares(address user, uint256 indexId) view returns (uint256)",
  "function totalShares(uint256 indexId) view returns (uint256)",
] as const;

export const NFARegistryV2ABI = [
  "function registerAgent(string, string, string, string) returns (uint256)",
  "function updateState(uint256 agentId, uint8 newState)",
  "function fundAgent(uint256 agentId) payable",
  "function withdrawAgentFunds(uint256 agentId, uint256 amount)",
  "function getAgentMetadata(uint256 agentId) view returns (string, string, string, string, uint256)",
  "function getAgentState(uint256 agentId) view returns (uint8)",
  "function getAgentOwner(uint256 agentId) view returns (address)",
  "function getRevenueProfile(uint256 agentId) view returns (uint256, uint256, uint256, uint256, bytes32, uint256[12], uint8)",
  "function creditRatings(uint256 agentId) view returns (uint8)",
  "function getAgentBalance(uint256 agentId) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function calculateCreditScore(uint256 agentId) view returns (uint256, uint8)",
  "function getMonthlyRevenue(uint256 agentId) view returns (uint256[12])",
  "function creditFactors(uint256 agentId) view returns (uint256, uint256, uint256, uint256, uint256)",
  "function getEvolutionLevel(uint256 agentId) view returns (uint8)",
  "function getMerkleRoot(uint256 agentId) view returns (bytes32)",
  "function getCapitalRaised(uint256 agentId) view returns (uint256)",
  "function getMilestoneThresholds() view returns (uint256[5])",
  "function capitalRaised(uint256 agentId) view returns (uint256)",
  "function evolutionLevel(uint256 agentId) view returns (uint8)",
  "function agentMerkleRoot(uint256 agentId) view returns (bytes32)",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
  "event AgentStateChanged(uint256 indexed agentId, uint8 newState)",
  "event RevenueRecorded(uint256 indexed agentId, uint256 amount, uint256 totalEarned)",
  "event SharpeUpdated(uint256 indexed agentId, uint256 sharpeRatio, bytes32 proofHash)",
  "event CreditRatingUpdated(uint256 indexed agentId, uint8 rating)",
  "event CapitalEvolution(uint256 indexed agentId, uint8 newLevel, uint256 capitalRaisedTotal, bytes32 merkleRoot)",
  "event MerkleRootUpdated(uint256 indexed agentId, bytes32 merkleRoot)",
] as const;

export const GreenfieldDataVaultABI = [
  "function registerDataAsset(uint256 agentId, string bucketName, string objectName, bytes32 contentHash, uint8 dataType, uint256 size) returns (uint256)",
  "function verifyAsset(uint256 assetId)",
  "function deactivateAsset(uint256 assetId)",
  "function getAgentAssets(uint256 agentId) view returns (uint256[])",
  "function getAgentAssetCount(uint256 agentId) view returns (uint256)",
  "function getVerifiedAssetCount(uint256 agentId) view returns (uint256)",
  "function getTotalDataSize(uint256 agentId) view returns (uint256)",
  "function getDataAsset(uint256 assetId) view returns (uint256, string, string, bytes32, uint8, uint256, uint256, bool, bool)",
  "function verifierAddress() view returns (address)",
  "event DataAssetRegistered(uint256 indexed assetId, uint256 indexed agentId, string bucketName, string objectName, bytes32 contentHash, uint8 dataType, uint256 size)",
  "event DataAssetVerified(uint256 indexed assetId, uint256 indexed agentId)",
  "event DataAssetDeactivated(uint256 indexed assetId, uint256 indexed agentId)",
] as const;

export const ComputeMarketplaceABI = [
  "function registerResource(string, string, uint8, uint256, address, uint8, uint8, uint256) returns (uint256)",
  "function updateResourcePrice(uint256 resourceId, uint256 newPrice)",
  "function deactivateResource(uint256 resourceId)",
  "function rentComputeBNB(uint256 agentId, uint256 resourceId, uint256 units, uint256 durationHours) payable returns (uint256)",
  "function rentComputeERC20(uint256 agentId, uint256 resourceId, uint256 units, uint256 durationHours) returns (uint256)",
  "function endRental(uint256 rentalId)",
  "function claimPayment(uint256 rentalId)",
  "function resources(uint256 resourceId) view returns (address, string, string, uint8, uint256, address, uint8, uint8, uint256, uint256, bool)",
  "function rentals(uint256 rentalId) view returns (uint256, uint256, uint256, uint256, uint256, uint256, address, bool, bool)",
  "function getAgentRentals(uint256 agentId) view returns (uint256[])",
  "function getProviderResources(address provider) view returns (uint256[])",
  "function getActiveRentalCount(uint256 agentId) view returns (uint256)",
  "function isEligible(uint256 agentId, uint256 resourceId) view returns (bool)",
  "function protocolFeeBps() view returns (uint256)",
  "event ResourceRegistered(uint256 indexed resourceId, address indexed provider, string name, uint8 resourceType, uint256 pricePerHour, address paymentToken, uint8 minCreditRating, uint8 minEvolutionLevel, uint256 totalCapacity)",
  "event ComputeRented(uint256 indexed rentalId, uint256 indexed agentId, uint256 indexed resourceId, uint256 units, uint256 duration, uint256 totalCost)",
  "event RentalEnded(uint256 indexed rentalId, uint256 refundAmount)",
  "event PaymentClaimed(uint256 indexed rentalId, uint256 providerAmount, uint256 protocolFee)",
] as const;

export const BondCollateralWrapperABI = [
  "function wrap(uint256 classId, uint256 nonceId, uint256 amount) returns (uint256)",
  "function unwrap(uint256 tokenId)",
  "function getWrappedPosition(uint256 tokenId) view returns (uint256, uint256, uint256)",
  "function wrappedPositions(uint256 tokenId) view returns (uint256, uint256, uint256)",
  "function bondManager() view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Wrapped(uint256 indexed tokenId, address indexed owner, uint256 classId, uint256 nonceId, uint256 amount)",
  "event Unwrapped(uint256 indexed tokenId, address indexed owner, uint256 classId, uint256 nonceId, uint256 amount)",
] as const;

export const TEERegistryABI = [
  "function authorizeTEEAgent(uint256 agentId, address teeWallet)",
  "function revokeTEEAgent(uint256 agentId)",
  "function pushTEEAttestation(uint256 agentId, bytes32 quoteHash)",
  "function isTEEAgent(uint256 agentId, address candidate) view returns (bool)",
  "function getTEEStatus(uint256 agentId) view returns (address, bytes32, uint256, bool)",
  "function authorizedTEEAgent(uint256 agentId) view returns (address)",
  "function teeAttestationHash(uint256 agentId) view returns (bytes32)",
  "function teeAttestationTime(uint256 agentId) view returns (uint256)",
  "event TEEAgentAuthorized(uint256 indexed agentId, address indexed teeWallet)",
  "event TEEAgentRevoked(uint256 indexed agentId)",
  "event TEEAttestationPushed(uint256 indexed agentId, bytes32 quoteHash, uint256 timestamp)",
] as const;
