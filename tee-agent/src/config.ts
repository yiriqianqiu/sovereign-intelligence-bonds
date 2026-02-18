export const config = {
  port: parseInt(process.env.PORT || "3100", 10),
  bscRpcUrl: process.env.BSC_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  chainId: parseInt(process.env.CHAIN_ID || "97", 10),

  dstackSimulatorEndpoint: process.env.DSTACK_SIMULATOR_ENDPOINT || "http://localhost:8090",

  // Contract addresses
  teeRegistryAddress: process.env.TEE_REGISTRY_ADDRESS as `0x${string}` || "0x29212A3E489236B56Ea4e383da78b6d2EF347Cf3",
  sibControllerAddress: process.env.SIB_CONTROLLER_ADDRESS as `0x${string}` || "0xD1B48E15Fa47B5AeA35A2f8327Bd8773fb4826d4",
  x402ReceiverAddress: process.env.X402_RECEIVER_ADDRESS as `0x${string}` || "0xFe053fFa3F3A873Bfc5f65E5000D4e4FcD4C8c1F",
  nfaRegistryAddress: process.env.NFA_REGISTRY_ADDRESS as `0x${string}` || "0x802E67532B974ece533702311a66fEE000c1C325",
  greenfieldVaultAddress: process.env.GREENFIELD_VAULT_ADDRESS as `0x${string}` || "0x553e9ADF83df29aE84f9C1b4FA1505567cf421Cd",
  computeMarketplaceAddress: process.env.COMPUTE_MARKETPLACE_ADDRESS as `0x${string}` || "0x22bEa0382eb3295d2028bB9d5767DE73f52c2F5e",

  // Agent configuration
  agentId: parseInt(process.env.AGENT_ID || "1", 10),
  proverServiceUrl: process.env.PROVER_SERVICE_URL || "http://localhost:8000",

  // Scheduler intervals (ms)
  attestationInterval: parseInt(process.env.ATTESTATION_INTERVAL || "43200000", 10),   // 12 hours
  dividendCheckInterval: parseInt(process.env.DIVIDEND_CHECK_INTERVAL || "21600000", 10), // 6 hours
  dividendThresholdBnb: parseFloat(process.env.DIVIDEND_THRESHOLD_BNB || "0.01"),
};
