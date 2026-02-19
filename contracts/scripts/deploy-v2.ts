/**
 * SIB v2 Deploy Script: Deploy all v2 contracts to BSC Testnet.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/deploy-v2.ts --network bscTestnet
 *
 * Deploy order (17 contracts + wiring):
 *   1.  MockVerifier
 *   2.  TokenRegistry
 *   3.  NFARegistry
 *   4.  SIBBondManager
 *   5.  DividendVaultV2
 *   6.  TranchingEngine
 *   7.  SIBControllerV2
 *   8.  B402PaymentReceiver
 *   9.  LiquidationEngine
 *   10. BondDEX
 *   11. BondholderGovernor
 *   12. AutoCompoundVault
 *   13. IndexBond
 *   14. BondCollateralWrapper
 *   15. GreenfieldDataVault
 *   16. ComputeMarketplace
 *   17. MockERC20 x2 (USDT, USDC)
 */

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying SIB v2 contracts...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "BNB"
  );
  console.log("---");

  // 1. MockVerifier
  console.log("[1/15] Deploying MockVerifier...");
  const MockVerifier = await ethers.getContractFactory("MockVerifier");
  const verifier = await MockVerifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("  MockVerifier:", verifierAddr);

  // 2. TokenRegistry
  console.log("[2/15] Deploying TokenRegistry...");
  const TokenRegistry = await ethers.getContractFactory("TokenRegistry");
  const tokenRegistry = await TokenRegistry.deploy(deployer.address);
  await tokenRegistry.waitForDeployment();
  const tokenRegistryAddr = await tokenRegistry.getAddress();
  console.log("  TokenRegistry:", tokenRegistryAddr);

  // 3. NFARegistry
  console.log("[3/15] Deploying NFARegistry...");
  const NFARegistry = await ethers.getContractFactory("NFARegistry");
  const registry = await NFARegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("  NFARegistry:", registryAddr);

  // 4. SIBBondManager
  console.log("[4/15] Deploying SIBBondManager...");
  const SIBBondManager = await ethers.getContractFactory("SIBBondManager");
  const bondManager = await SIBBondManager.deploy();
  await bondManager.waitForDeployment();
  const bondManagerAddr = await bondManager.getAddress();
  console.log("  SIBBondManager:", bondManagerAddr);

  // 5. DividendVaultV2
  console.log("[5/15] Deploying DividendVaultV2...");
  const DividendVaultV2 = await ethers.getContractFactory("DividendVaultV2");
  const vaultV2 = await DividendVaultV2.deploy();
  await vaultV2.waitForDeployment();
  const vaultV2Addr = await vaultV2.getAddress();
  console.log("  DividendVaultV2:", vaultV2Addr);

  // 6. TranchingEngine
  console.log("[6/15] Deploying TranchingEngine...");
  const TranchingEngine = await ethers.getContractFactory("TranchingEngine");
  const tranching = await TranchingEngine.deploy(bondManagerAddr);
  await tranching.waitForDeployment();
  const tranchingAddr = await tranching.getAddress();
  console.log("  TranchingEngine:", tranchingAddr);

  // 7. SIBControllerV2
  console.log("[7/15] Deploying SIBControllerV2...");
  const SIBControllerV2 = await ethers.getContractFactory("SIBControllerV2");
  const controllerV2 = await SIBControllerV2.deploy(
    registryAddr,
    bondManagerAddr,
    vaultV2Addr,
    verifierAddr,
    tokenRegistryAddr
  );
  await controllerV2.waitForDeployment();
  const controllerV2Addr = await controllerV2.getAddress();
  console.log("  SIBControllerV2:", controllerV2Addr);

  // 8. B402PaymentReceiver
  console.log("[8/15] Deploying B402PaymentReceiver...");
  const B402PaymentReceiver = await ethers.getContractFactory(
    "B402PaymentReceiver"
  );
  const b402 = await B402PaymentReceiver.deploy();
  await b402.waitForDeployment();
  const b402Addr = await b402.getAddress();
  console.log("  B402PaymentReceiver:", b402Addr);

  // 9. LiquidationEngine
  console.log("[9/15] Deploying LiquidationEngine...");
  const LiquidationEngine = await ethers.getContractFactory(
    "LiquidationEngine"
  );
  const liquidation = await LiquidationEngine.deploy(
    registryAddr,
    bondManagerAddr
  );
  await liquidation.waitForDeployment();
  const liquidationAddr = await liquidation.getAddress();
  console.log("  LiquidationEngine:", liquidationAddr);

  // 10. BondDEX
  console.log("[10/15] Deploying BondDEX...");
  const BondDEX = await ethers.getContractFactory("BondDEX");
  const bondDEX = await BondDEX.deploy(bondManagerAddr, vaultV2Addr);
  await bondDEX.waitForDeployment();
  const bondDEXAddr = await bondDEX.getAddress();
  console.log("  BondDEX:", bondDEXAddr);

  // 11. BondholderGovernor
  console.log("[11/15] Deploying BondholderGovernor...");
  const BondholderGovernor = await ethers.getContractFactory(
    "BondholderGovernor"
  );
  const governor = await BondholderGovernor.deploy(bondManagerAddr);
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log("  BondholderGovernor:", governorAddr);

  // 12. AutoCompoundVault
  console.log("[12/15] Deploying AutoCompoundVault...");
  const AutoCompoundVault = await ethers.getContractFactory(
    "AutoCompoundVault"
  );
  const autoCompound = await AutoCompoundVault.deploy(
    bondManagerAddr,
    vaultV2Addr,
    controllerV2Addr
  );
  await autoCompound.waitForDeployment();
  const autoCompoundAddr = await autoCompound.getAddress();
  console.log("  AutoCompoundVault:", autoCompoundAddr);

  // 13. IndexBond
  console.log("[13/15] Deploying IndexBond...");
  const IndexBond = await ethers.getContractFactory("IndexBond");
  const indexBond = await IndexBond.deploy(bondManagerAddr, controllerV2Addr);
  await indexBond.waitForDeployment();
  const indexBondAddr = await indexBond.getAddress();
  console.log("  IndexBond:", indexBondAddr);

  // 14. BondCollateralWrapper
  console.log("[14/15] Deploying BondCollateralWrapper...");
  const BondCollateralWrapper = await ethers.getContractFactory(
    "BondCollateralWrapper"
  );
  const collateralWrapper = await BondCollateralWrapper.deploy(bondManagerAddr);
  await collateralWrapper.waitForDeployment();
  const collateralWrapperAddr = await collateralWrapper.getAddress();
  console.log("  BondCollateralWrapper:", collateralWrapperAddr);

  // 15. GreenfieldDataVault
  console.log("[15/17] Deploying GreenfieldDataVault...");
  const GreenfieldDataVault = await ethers.getContractFactory(
    "GreenfieldDataVault"
  );
  const greenfieldVault = await GreenfieldDataVault.deploy(registryAddr);
  await greenfieldVault.waitForDeployment();
  const greenfieldVaultAddr = await greenfieldVault.getAddress();
  console.log("  GreenfieldDataVault:", greenfieldVaultAddr);

  // 16. ComputeMarketplace
  console.log("[16/17] Deploying ComputeMarketplace...");
  const ComputeMarketplace = await ethers.getContractFactory(
    "ComputeMarketplace"
  );
  const computeMarketplace = await ComputeMarketplace.deploy(
    registryAddr,
    tokenRegistryAddr
  );
  await computeMarketplace.waitForDeployment();
  const computeMarketplaceAddr = await computeMarketplace.getAddress();
  console.log("  ComputeMarketplace:", computeMarketplaceAddr);

  // 17. MockERC20 x2 (USDT, USDC)
  console.log("[17/17] Deploying MockERC20 (USDT + USDC)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const mockUsdt = await MockERC20.deploy("Mock USDT", "USDT", 18);
  await mockUsdt.waitForDeployment();
  const mockUsdtAddr = await mockUsdt.getAddress();
  console.log("  MockUSDT:", mockUsdtAddr);

  const mockUsdc = await MockERC20.deploy("Mock USDC", "USDC", 18);
  await mockUsdc.waitForDeployment();
  const mockUsdcAddr = await mockUsdc.getAddress();
  console.log("  MockUSDC:", mockUsdcAddr);

  // ========== Post-deploy wiring ==========
  console.log("\nWiring permissions (10 calls)...");

  // 1. NFARegistry.setController
  const w1 = await registry.setController(controllerV2Addr);
  await w1.wait();
  console.log("  [1/10] NFARegistry.setController -> done");

  // 2. SIBBondManager.setController
  const w2 = await bondManager.setController(controllerV2Addr);
  await w2.wait();
  console.log("  [2/10] SIBBondManager.setController -> done");

  // 3. SIBBondManager.setDividendVault
  const w3 = await bondManager.setDividendVault(vaultV2Addr);
  await w3.wait();
  console.log("  [3/10] SIBBondManager.setDividendVault -> done");

  // 4. DividendVaultV2.setController
  const w4 = await vaultV2.setController(controllerV2Addr);
  await w4.wait();
  console.log("  [4/10] DividendVaultV2.setController -> done");

  // 5. DividendVaultV2.setBondManager
  const w5 = await vaultV2.setBondManager(bondManagerAddr);
  await w5.wait();
  console.log("  [5/10] DividendVaultV2.setBondManager -> done");

  // 6. DividendVaultV2.setTranchingEngine
  const w6 = await vaultV2.setTranchingEngine(tranchingAddr);
  await w6.wait();
  console.log("  [6/10] DividendVaultV2.setTranchingEngine -> done");

  // 7. TranchingEngine.setController
  const w7 = await tranching.setController(controllerV2Addr);
  await w7.wait();
  console.log("  [7/10] TranchingEngine.setController -> done");

  // 8. B402PaymentReceiver.setController
  const w8 = await b402.setController(controllerV2Addr);
  await w8.wait();
  console.log("  [8/10] B402PaymentReceiver.setController -> done");

  // 9. LiquidationEngine.setController
  const w9 = await liquidation.setController(controllerV2Addr);
  await w9.wait();
  console.log("  [9/10] LiquidationEngine.setController -> done");

  // 10. SIBControllerV2.setTranchingEngine
  const w10 = await controllerV2.setTranchingEngine(tranchingAddr);
  await w10.wait();
  console.log("  [10/10] SIBControllerV2.setTranchingEngine -> done");

  // ========== Token Registration ==========
  console.log("\nRegistering tokens...");

  const t1 = await tokenRegistry.addToken(
    mockUsdtAddr,
    "USDT",
    18,
    ethers.parseEther("1")
  );
  await t1.wait();
  console.log("  TokenRegistry.addToken(USDT) -> done");

  const t2 = await tokenRegistry.addToken(
    mockUsdcAddr,
    "USDC",
    18,
    ethers.parseEther("1")
  );
  await t2.wait();
  console.log("  TokenRegistry.addToken(USDC) -> done");

  // ========== Summary ==========
  const addresses: Record<string, string | number> = {
    MockVerifier: verifierAddr,
    TokenRegistry: tokenRegistryAddr,
    NFARegistry: registryAddr,
    SIBBondManager: bondManagerAddr,
    DividendVaultV2: vaultV2Addr,
    TranchingEngine: tranchingAddr,
    SIBControllerV2: controllerV2Addr,
    B402PaymentReceiver: b402Addr,
    LiquidationEngine: liquidationAddr,
    BondDEX: bondDEXAddr,
    BondholderGovernor: governorAddr,
    AutoCompoundVault: autoCompoundAddr,
    IndexBond: indexBondAddr,
    BondCollateralWrapper: collateralWrapperAddr,
    GreenfieldDataVault: greenfieldVaultAddr,
    ComputeMarketplace: computeMarketplaceAddr,
    MockUSDT: mockUsdtAddr,
    MockUSDC: mockUsdcAddr,
    deployer: deployer.address,
    network: "bscTestnet",
    chainId: 97,
  };

  console.log("\n=== v2 Deployment Complete ===");
  console.log(JSON.stringify(addresses, null, 2));

  // Write bsc.address file
  const bscAddressPath = path.join(__dirname, "..", "..", "bsc.address");
  const bscContent = Object.entries(addresses)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(bscAddressPath, bscContent + "\n");
  console.log(`\nAddresses written to ${bscAddressPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
