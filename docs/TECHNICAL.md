# Agent Wall Street -- Technical Architecture

## System Architecture

```
Investor                          AI Agent (TEE)
   |                                   |
   | buy bonds (BNB)                   | sell intelligence (b402)
   v                                   v
SIBControllerV2  <----------->  B402PaymentReceiver
   |                                   |
   | manage issuance                   | record revenue
   v                                   v
SIBBondManager (ERC-3475)         revenuePool
   |                                   |
   | mint / burn / transfer            | distributeDividends()
   v                                   v
TranchingEngine               DividendVaultV2
   |                                   |
   | senior-first waterfall            | MasterChef accumulator
   v                                   v
BondDEX (secondary market)    Bondholder claims BNB
   |
   +---> BondholderGovernor (on-chain voting)
   +---> LiquidationEngine (under-collateralized positions)
   +---> IndexBond (multi-agent baskets)
   +---> AutoCompoundVault (auto-roll maturing bonds)

zkML Layer:
  CreditModel (5D scoring) --> Halo2Verifier (EZKL on-chain)

TEE Layer:
  Phala dstack (Intel TDX) --> attestation + autonomous operations

Data Layer:
  GreenfieldDataVault --> encrypted agent performance data
```

## Tech Stack

| Layer | Technology | Details |
|---|---|---|
| Smart Contracts | Hardhat 3 + Solidity 0.8.28 + OpenZeppelin 5.4 | 18 production contracts, 707 tests |
| zkML | EZKL framework (Halo2 proving system) | Verifiable Sharpe ratio proofs on-chain |
| TEE Agent | Phala dstack (Intel TDX) + Express + viem | Autonomous agent with remote attestation |
| Frontend | Next.js 14 + wagmi v2 + RainbowKit + Tailwind CSS | 17 pages, 5 API routes, 12 hooks |
| Prover | FastAPI + Celery + Redis | Real EZKL proof generation pipeline (Docker Compose) |
| Subgraph | TheGraph (AssemblyScript) | 13 data sources, 20 entity types |
| Network | BNB Smart Chain Testnet | chainId 97 |

## Smart Contracts (18 deployed)

| Contract | Address | Purpose |
|---|---|---|
| NFARegistry | 0x802E67532B974ece533702311a66fEE000c1C325 | Agent identity + credit scoring |
| SIBControllerV2 | 0xc6a65c7268980DAAde58Fac12F9a3Ce2D2A881ab | Core controller (IPO/dividends/proof/TEE) |
| SIBBondManager | 0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8 | ERC-3475 bond mint/transfer/redeem |
| DividendVaultV2 | 0x66efb45Cd439CF3a216Df8682FFbebDc554729f1 | MasterChef dividend accumulator |
| TranchingEngine | 0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595 | Senior/junior waterfall |
| B402PaymentReceiver | 0x7248Ff93f64B4D0e49914016A91fbF7289dab90e | b402 micropayment receiver (EIP-712 + gasless) |
| Halo2Verifier | 0xad46573cEFE98dDcDB99e8c521fc094331B75f9d | EZKL Halo2 on-chain verifier |
| BondDEX | 0xB881e50fD22020a1774CAC535f00A77493350271 | Limit order book |
| BondholderGovernor | 0xdAe3DBC6e07d2C028D04aeCfe60084f4816b8135 | On-chain governance |
| LiquidationEngine | 0xB0a1f8055bb7C276007ccc8E193719375D5b0418 | Automated liquidation |
| AutoCompoundVault | 0xbD1506A35aD79f076cd035a8312448E50718ad13 | Auto-roll maturing bonds |
| IndexBond | 0x4ACDd6F2a9dB84ca5455529eC7F24b4BcC174F1f | Multi-agent bond baskets |
| BondCollateralWrapper | 0xaA1D9058A9970a8C00abF768eff21e2c0B86Cf7B | Bond collateral wrapping |
| GreenfieldDataVault | 0x862CaFca80f90eB7d83dDb5d21a6dbb1FcFc172B | Decentralized data vault |
| ComputeMarketplace | 0xe279cF8E564c170EF89C7E63600d16CFd37d9D99 | Agent compute marketplace |
| TokenRegistry | 0xC5824Ce1cbfFC4A13C2C31191606407de100eB65 | Token whitelist + pricing |
| TEERegistry | 0x437c8314DCCa0eA3B5F66195B5311CEC6d494690 | TEE delegation + attestation |
| MockUSDT | 0x74c4Ff55455c72A4a768e1DcFf733A0F676AfFD3 | Test stablecoin |

## Credit Model (zkML)

5-dimension weighted scoring, verified on-chain via EZKL Halo2 proofs:

| Dimension | Weight | Measures |
|---|---|---|
| Sharpe Ratio | 35% | Risk-adjusted returns |
| Stability | 25% | Revenue consistency |
| Frequency | 15% | Transaction regularity |
| Age | 10% | Operational maturity |
| Revenue | 15% | Cumulative earnings |

Score ranges: AAA (8000+), AA (6000-7999), A (4000-5999), B (2000-3999), C (0-1999).

## Revenue Flow (b402)

```
Client calls Agent intelligence API
  --> HTTP 402 Payment Required
  --> Client pays via b402 (BNB)
  --> B402PaymentReceiver records payment on-chain
  --> Revenue forwarded to SIBControllerV2 revenuePool
  --> distributeDividends() triggers waterfall
  --> TranchingEngine: senior tranche gets fixed coupon first
  --> TranchingEngine: junior tranche receives remainder
  --> DividendVaultV2 accumulates per-bond dividends (O(1) gas)
  --> Bondholders claim BNB at any time
```

## TEE Integration

The TEE (Trusted Execution Environment) layer uses Phala dstack with Intel TDX to provide hardware-level trust:

- **TEERegistry**: On-chain record of authorized TEE wallets + attestation hashes
- **Delegation**: Agent owners authorize TEE wallets to act on their behalf (submitSharpeProof, distributeDividends, initiateIPO, markBondsRedeemable)
- **Attestation**: TEE pushes TDX remote attestation quote hashes every 12 hours
- **Revenue relay**: TEE agent forwards b402 payments with authorized relay restriction
- **Autonomy**: Background schedulers for attestation (12h) and dividend distribution (6h)

## Project Structure

```
sovereign-intelligence-bonds/
  contracts/           Hardhat 3, 18 Solidity contracts, 707 tests
  src/                 Next.js 14 frontend (17 pages, 12 hooks, 7 components)
    app/               Page routes + 5 API endpoints
    components/        UI components (radar charts, order books, gauges)
    hooks/             Contract interaction hooks (wagmi v2)
    lib/               ABIs, addresses, utilities
  tee-agent/           Phala dstack TEE agent (Express + viem)
  prover-service/      FastAPI + Celery + Redis (Docker Compose)
  zkml/                PyTorch Sharpe model + EZKL proof pipeline
  subgraph/            TheGraph indexer (13 data sources, 20 entities)
  docs/                Project documentation
  bsc.address          Deployed contract addresses
```

## Build & Run

```bash
# Frontend
npm install && npm run dev

# Contracts
cd contracts && npm install && npx hardhat test

# TEE Agent
cd tee-agent && npm install && npm run dev

# Prover
cd prover-service && docker-compose up
```
