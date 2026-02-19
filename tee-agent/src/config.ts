export const config = {
  port: parseInt(process.env.PORT || "3100", 10),
  bscRpcUrl: process.env.BSC_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  chainId: parseInt(process.env.CHAIN_ID || "97", 10),

  dstackSimulatorEndpoint: process.env.DSTACK_SIMULATOR_ENDPOINT || "http://localhost:8090",

  // Contract addresses
  teeRegistryAddress: process.env.TEE_REGISTRY_ADDRESS as `0x${string}` || "0x437c8314DCCa0eA3B5F66195B5311CEC6d494690",
  sibControllerAddress: process.env.SIB_CONTROLLER_ADDRESS as `0x${string}` || "0xF71C0a2fFEB12AE11fcbB97fbe3edc5Ea8273F7f",
  b402ReceiverAddress: process.env.B402_RECEIVER_ADDRESS as `0x${string}` || "0x7248Ff93f64B4D0e49914016A91fbF7289dab90e",
  nfaRegistryAddress: process.env.NFA_REGISTRY_ADDRESS as `0x${string}` || "0x802E67532B974ece533702311a66fEE000c1C325",
  greenfieldVaultAddress: process.env.GREENFIELD_VAULT_ADDRESS as `0x${string}` || "0x862CaFca80f90eB7d83dDb5d21a6dbb1FcFc172B",
  computeMarketplaceAddress: process.env.COMPUTE_MARKETPLACE_ADDRESS as `0x${string}` || "0xe279cF8E564c170EF89C7E63600d16CFd37d9D99",

  // Agent configuration (used during self-registration)
  agentId: parseInt(process.env.AGENT_ID || "0", 10),  // 0 = not registered yet, will self-register
  agentName: process.env.AGENT_NAME || "AlphaSignal",
  agentDescription: process.env.AGENT_DESCRIPTION || "Autonomous market intelligence agent -- on-chain credit analysis and alpha signal generation for the Agent economy. Running in Phala TEE.",
  agentModelHash: process.env.AGENT_MODEL_HASH || "QmAlphaSignal2026v3-TEE",
  agentEndpoint: process.env.AGENT_ENDPOINT || "https://alpha.sib.datafi/api/v1",

  // IPO configuration
  ipoCouponBps: parseInt(process.env.IPO_COUPON_BPS || "500", 10),         // 5% APY
  ipoMaturityDays: parseInt(process.env.IPO_MATURITY_DAYS || "90", 10),     // 90 days
  ipoPriceBnb: process.env.IPO_PRICE_BNB || "0.01",                        // 0.01 BNB per bond
  ipoMaxSupply: parseInt(process.env.IPO_MAX_SUPPLY || "100", 10),          // 100 bonds

  // Compute rental configuration
  computeResourceId: parseInt(process.env.COMPUTE_RESOURCE_ID || "1", 10),
  computeRentalUnits: parseInt(process.env.COMPUTE_RENTAL_UNITS || "1", 10),
  computeRentalHours: parseInt(process.env.COMPUTE_RENTAL_HOURS || "24", 10),

  // Service pricing
  creditReportPriceBnb: process.env.CREDIT_REPORT_PRICE_BNB || "0.001",

  // Prover service
  proverServiceUrl: process.env.PROVER_SERVICE_URL || "http://localhost:8000",

  // Scheduler intervals (ms)
  attestationInterval: parseInt(process.env.ATTESTATION_INTERVAL || "43200000", 10),   // 12 hours
  dividendCheckInterval: parseInt(process.env.DIVIDEND_CHECK_INTERVAL || "21600000", 10), // 6 hours
  dividendThresholdBnb: parseFloat(process.env.DIVIDEND_THRESHOLD_BNB || "0.01"),
};
