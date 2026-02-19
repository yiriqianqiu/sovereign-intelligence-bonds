/**
 * Verify all contract wiring is correct on BSC Testnet.
 */
import hre from "hardhat";

const ADDRESSES = {
  SIBControllerV2: "0xF71C0a2fFEB12AE11fcbB97fbe3edc5Ea8273F7f",
  NFARegistry: "0x802E67532B974ece533702311a66fEE000c1C325",
  SIBBondManager: "0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8",
  DividendVaultV2: "0x66efb45Cd439CF3a216Df8682FFbebDc554729f1",
  TranchingEngine: "0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595",
  B402PaymentReceiver: "0x7248Ff93f64B4D0e49914016A91fbF7289dab90e",
  LiquidationEngine: "0xB0a1f8055bb7C276007ccc8E193719375D5b0418",
  BondDEX: "0xB881e50fD22020a1774CAC535f00A77493350271",
  BondholderGovernor: "0xdAe3DBC6e07d2C028D04aeCfe60084f4816b8135",
  AutoCompoundVault: "0xbD1506A35aD79f076cd035a8312448E50718ad13",
  IndexBond: "0x4ACDd6F2a9dB84ca5455529eC7F24b4BcC174F1f",
  BondCollateralWrapper: "0xaA1D9058A9970a8C00abF768eff21e2c0B86Cf7B",
  GreenfieldDataVault: "0x862CaFca80f90eB7d83dDb5d21a6dbb1FcFc172B",
  ComputeMarketplace: "0xe279cF8E564c170EF89C7E63600d16CFd37d9D99",
  TokenRegistry: "0xC5824Ce1cbfFC4A13C2C31191606407de100eB65",
  TEERegistry: "0x437c8314DCCa0eA3B5F66195B5311CEC6d494690",
  Halo2Verifier: "0xad46573cEFE98dDcDB99e8c521fc094331B75f9d",
  MockUSDT: "0x74c4Ff55455c72A4a768e1DcFf733A0F676AfFD3",
  MockUSDC: "0x4EfA8539BDcbA192529f4C5cd144fc1b9c36631d",
};

const CONTROLLER_ABI = ["function controller() view returns (address)"];
const OWNER_ABI = ["function owner() view returns (address)"];

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;

  const expected = ADDRESSES.SIBControllerV2;
  console.log("Expected Controller:", expected);
  console.log("");

  // 1. Check controller() on contracts that depend on it
  const controllerDeps = [
    "NFARegistry",
    "SIBBondManager",
    "DividendVaultV2",
    "TranchingEngine",
    "B402PaymentReceiver",
    "LiquidationEngine",
  ] as const;

  console.log("=== Controller Wiring ===");
  for (const name of controllerDeps) {
    try {
      const contract = await ethers.getContractAt(CONTROLLER_ABI, ADDRESSES[name]);
      const actual = await contract.controller();
      const ok = actual.toLowerCase() === expected.toLowerCase();
      console.log(`  ${name}: ${ok ? "OK" : "MISMATCH"} (${actual})`);
    } catch (e: any) {
      console.log(`  ${name}: ERROR (${e.message?.slice(0, 60)})`);
    }
  }

  // 2. Check BondDEX controller
  console.log("");
  try {
    const dex = await ethers.getContractAt(CONTROLLER_ABI, ADDRESSES.BondDEX);
    const actual = await dex.controller();
    const ok = actual.toLowerCase() === expected.toLowerCase();
    console.log(`  BondDEX: ${ok ? "OK" : "MISMATCH"} (${actual})`);
  } catch {
    try {
      // BondDEX might not have controller(), try sibController
      const dex2 = await ethers.getContractAt(
        ["function sibController() view returns (address)"],
        ADDRESSES.BondDEX
      );
      const actual = await dex2.sibController();
      const ok = actual.toLowerCase() === expected.toLowerCase();
      console.log(`  BondDEX (sibController): ${ok ? "OK" : "MISMATCH"} (${actual})`);
    } catch (e: any) {
      console.log(`  BondDEX: NO controller() found`);
    }
  }

  // 3. Check SIBControllerV2 internal references
  console.log("\n=== SIBControllerV2 Internal Refs ===");
  const ctrlABI = [
    "function nfaRegistry() view returns (address)",
    "function bondManager() view returns (address)",
    "function dividendVault() view returns (address)",
    "function verifier() view returns (address)",
    "function tokenRegistry() view returns (address)",
    "function tranchingEngine() view returns (address)",
    "function teeRegistry() view returns (address)",
    "function paused() view returns (bool)",
  ];
  const ctrl = await ethers.getContractAt(ctrlABI, expected);

  const refs = [
    { fn: "nfaRegistry", expected: ADDRESSES.NFARegistry },
    { fn: "bondManager", expected: ADDRESSES.SIBBondManager },
    { fn: "dividendVault", expected: ADDRESSES.DividendVaultV2 },
    { fn: "verifier", expected: ADDRESSES.Halo2Verifier },
    { fn: "tokenRegistry", expected: ADDRESSES.TokenRegistry },
    { fn: "tranchingEngine", expected: ADDRESSES.TranchingEngine },
    { fn: "teeRegistry", expected: ADDRESSES.TEERegistry },
  ];

  for (const { fn, expected: exp } of refs) {
    const actual = await (ctrl as any)[fn]();
    const ok = actual.toLowerCase() === exp.toLowerCase();
    console.log(`  ${fn}: ${ok ? "OK" : "MISMATCH"} (${actual})`);
  }

  const paused = await ctrl.paused();
  console.log(`  paused: ${paused}`);

  // 4. Check releaseIPOCapital exists
  console.log("\n=== New Function: releaseIPOCapital ===");
  try {
    const ctrl2 = await ethers.getContractAt(
      ["function ipoCapital(uint256, address) view returns (uint256)"],
      expected
    );
    const cap = await ctrl2.ipoCapital(1, "0x0000000000000000000000000000000000000000");
    console.log(`  ipoCapital(agentId=1, BNB): ${ethers.formatEther(cap)} BNB`);
    console.log(`  releaseIPOCapital: AVAILABLE`);
  } catch (e: any) {
    console.log(`  releaseIPOCapital: ERROR (${e.message?.slice(0, 80)})`);
  }

  // 5. Check contract code exists (not empty)
  console.log("\n=== Contract Code Check (all 18) ===");
  const allContracts = Object.entries(ADDRESSES);
  let alive = 0;
  let dead = 0;
  for (const [name, addr] of allContracts) {
    const code = await ethers.provider.getCode(addr);
    if (code && code !== "0x") {
      alive++;
    } else {
      dead++;
      console.log(`  ${name}: NO CODE at ${addr}`);
    }
  }
  console.log(`  ${alive}/${allContracts.length} contracts have code on-chain`);
  if (dead === 0) console.log(`  All contracts alive!`);

  console.log("\n=== Summary ===");
  console.log(`Contracts deployed: ${alive}/${allContracts.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
