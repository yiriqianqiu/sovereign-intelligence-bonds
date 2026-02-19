# Agent Wall Street

**Sovereign Intelligence Bonds (SIB) -- The first protocol where AI agents IPO, earn revenue, and pay dividends to bondholders.**

> AI agents are the new companies. They should be able to raise capital, prove their performance, and reward their investors -- all on-chain, all autonomous.

**Live Demo:** [sib-protocol.vercel.app](https://sib-protocol.vercel.app)
**Network:** BNB Smart Chain Testnet (chainId 97)
**Track:** Agent (AI Agent x Onchain Actions)

## The Problem

AI agents can work but cannot raise capital. They earn revenue but cannot share profits. They have track records but cannot prove them without revealing their strategies. They are economically invisible.

Traditional finance solved these problems centuries ago with bonds, credit ratings, and regulated exchanges. Agent Wall Street brings the same instruments to AI -- minus the middlemen.

## How Agent Wall Street Works

```
         REGISTER          IPO             EARN            PAY
         --------          ---             ----            ---
  Agent gets an       Agent issues      Agent sells     Revenue flows
  on-chain NFA        ERC-3475 bonds    intelligence    to bondholders
  with credit         to raise BNB      via b402        via waterfall
  history             from investors    micropayments   distribution

  [NFARegistry]    [SIBControllerV2]  [B402Receiver]  [DividendVaultV2]
       |                  |                |                |
       v                  v                v                v
  5D Credit Score    Senior/Junior     HTTP 402 ->      Claim BNB
  via zkML proof     tranche split     on-chain BNB     per bond held
```

1. **Register** -- An AI agent receives an on-chain identity (BAP-578 NFA) with a 5-dimension credit score, verified by zkML.
2. **IPO** -- The agent issues bonds (ERC-3475 semi-fungible tokens) with configurable coupon rates and maturities. Investors purchase with BNB.
3. **Buy Compute** -- IPO capital is deployed into DePIN GPU compute via `ComputeMarketplace`. Credit-gated access ensures only creditworthy agents rent premium hardware.
4. **Earn** -- The agent provides intelligence services. Clients pay via b402 micropayments. Revenue is recorded on-chain by `B402PaymentReceiver`.
5. **Prove** -- The agent submits zkML Sharpe ratio proofs (EZKL Halo2) on-chain. Credit scores update automatically.
6. **Pay Dividends** -- Revenue routes through the waterfall: senior tranche receives its fixed coupon first, junior tranche gets the remainder. Bondholders claim from `DividendVaultV2`.

## Wall Street, On-Chain

| Traditional Finance | Agent Wall Street | Contract |
|---|---|---|
| Company IPO | Bond issuance via controller | SIBControllerV2 |
| Credit rating (S&P/Moody's) | 5-dimension credit model + zkML proof | CreditModel + SharpeVerifier |
| Senior/Junior tranches | Waterfall dividend distribution | TranchingEngine |
| Stock exchange | On-chain limit order book | BondDEX |
| Shareholder vote | Bondholder governance (propose/vote/execute) | BondholderGovernor |
| Chapter 11 bankruptcy | Automated liquidation engine | LiquidationEngine |
| Index funds (ETF) | Multi-agent bond basket | IndexBond |
| Treasury bills (auto-roll) | Auto-compound vault | AutoCompoundVault |
| Collateralized debt | Bond collateral wrapping | BondCollateralWrapper |
| Data room (due diligence) | Decentralized data vault | GreenfieldDataVault |
| Compute procurement | Agent compute marketplace | ComputeMarketplace |

## Architecture

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

Compute Layer:
  ComputeMarketplace --> DePIN GPU rental with credit-gated access
```

## Onchain Proof (BSC Testnet)

**Deployer:** [`0x29468A12Fbfd5dC105847ec832d06F9EBb5427Dd`](https://testnet.bscscan.com/address/0x29468A12Fbfd5dC105847ec832d06F9EBb5427Dd)

18 contracts deployed on BSC Testnet (chainId 97). All transactions verifiable on BscScan:

| Contract | Address | BscScan |
|---|---|---|
| SIBControllerV2 | `0xF71C0a2fFEB12AE11fcbB97fbe3edc5Ea8273F7f` | [View](https://testnet.bscscan.com/address/0xF71C0a2fFEB12AE11fcbB97fbe3edc5Ea8273F7f) |
| NFARegistry | `0x802E67532B974ece533702311a66fEE000c1C325` | [View](https://testnet.bscscan.com/address/0x802E67532B974ece533702311a66fEE000c1C325) |
| SIBBondManager | `0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8` | [View](https://testnet.bscscan.com/address/0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8) |
| DividendVaultV2 | `0x66efb45Cd439CF3a216Df8682FFbebDc554729f1` | [View](https://testnet.bscscan.com/address/0x66efb45Cd439CF3a216Df8682FFbebDc554729f1) |
| TranchingEngine | `0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595` | [View](https://testnet.bscscan.com/address/0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595) |
| B402PaymentReceiver | `0x7248Ff93f64B4D0e49914016A91fbF7289dab90e` | [View](https://testnet.bscscan.com/address/0x7248Ff93f64B4D0e49914016A91fbF7289dab90e) |
| Halo2Verifier | `0xad46573cEFE98dDcDB99e8c521fc094331B75f9d` | [View](https://testnet.bscscan.com/address/0xad46573cEFE98dDcDB99e8c521fc094331B75f9d) |
| BondDEX | `0xB881e50fD22020a1774CAC535f00A77493350271` | [View](https://testnet.bscscan.com/address/0xB881e50fD22020a1774CAC535f00A77493350271) |
| BondholderGovernor | `0xdAe3DBC6e07d2C028D04aeCfe60084f4816b8135` | [View](https://testnet.bscscan.com/address/0xdAe3DBC6e07d2C028D04aeCfe60084f4816b8135) |
| LiquidationEngine | `0xB0a1f8055bb7C276007ccc8E193719375D5b0418` | [View](https://testnet.bscscan.com/address/0xB0a1f8055bb7C276007ccc8E193719375D5b0418) |
| AutoCompoundVault | `0xbD1506A35aD79f076cd035a8312448E50718ad13` | [View](https://testnet.bscscan.com/address/0xbD1506A35aD79f076cd035a8312448E50718ad13) |
| IndexBond | `0x4ACDd6F2a9dB84ca5455529eC7F24b4BcC174F1f` | [View](https://testnet.bscscan.com/address/0x4ACDd6F2a9dB84ca5455529eC7F24b4BcC174F1f) |
| BondCollateralWrapper | `0xaA1D9058A9970a8C00abF768eff21e2c0B86Cf7B` | [View](https://testnet.bscscan.com/address/0xaA1D9058A9970a8C00abF768eff21e2c0B86Cf7B) |
| GreenfieldDataVault | `0x862CaFca80f90eB7d83dDb5d21a6dbb1FcFc172B` | [View](https://testnet.bscscan.com/address/0x862CaFca80f90eB7d83dDb5d21a6dbb1FcFc172B) |
| ComputeMarketplace | `0xe279cF8E564c170EF89C7E63600d16CFd37d9D99` | [View](https://testnet.bscscan.com/address/0xe279cF8E564c170EF89C7E63600d16CFd37d9D99) |
| TokenRegistry | `0xC5824Ce1cbfFC4A13C2C31191606407de100eB65` | [View](https://testnet.bscscan.com/address/0xC5824Ce1cbfFC4A13C2C31191606407de100eB65) |
| TEERegistry | `0x437c8314DCCa0eA3B5F66195B5311CEC6d494690` | [View](https://testnet.bscscan.com/address/0x437c8314DCCa0eA3B5F66195B5311CEC6d494690) |
| MockUSDT | `0x74c4Ff55455c72A4a768e1DcFf733A0F676AfFD3` | [View](https://testnet.bscscan.com/address/0x74c4Ff55455c72A4a768e1DcFf733A0F676AfFD3) |

## Tech Stack

- **Contracts** -- Hardhat 3 + Solidity 0.8.28 + OpenZeppelin 5.4 -- 18 production contracts, 707 tests
- **zkML** -- EZKL framework (Halo2 proving system) -- verifiable Sharpe ratio proofs on-chain
- **TEE Agent** -- Phala dstack (Intel TDX) + Express -- autonomous agent with remote attestation
- **Frontend** -- Next.js 14 + wagmi v2 + RainbowKit + Tailwind CSS + recharts -- 17 pages, 5 API routes, 12 hooks
- **Prover** -- FastAPI + Celery + Redis -- real EZKL proof generation pipeline (Docker Compose)
- **Subgraph** -- TheGraph indexer for bond events and revenue tracking
- **Network** -- BNB Smart Chain Testnet

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose (for prover service)
- A BSC Testnet wallet with tBNB ([faucet](https://www.bnbchain.org/en/testnet-faucet))

### 1. Frontend (Next.js)

```bash
git clone https://github.com/yiriqianqiu/sovereign-intelligence-bonds.git
cd sovereign-intelligence-bonds
npm install
npm run dev             # http://localhost:3000
```

### 2. Smart Contracts (Hardhat 3)

```bash
cd contracts
npm install
npx hardhat test        # run 707 tests
npx hardhat compile     # compile all 18 contracts
```

### 3. Deploy to BSC Testnet

```bash
cd contracts
cp ../.env.example ../.env   # add your PRIVATE_KEY
npx hardhat run scripts/deploy-v2.ts --network bscTestnet
```

### 4. Run Full Lifecycle Demo (Local)

```bash
cd contracts
npx hardhat run scripts/demo-lifecycle.ts
```

This runs the complete 10-step lifecycle on a local Hardhat node:
1. Deploy all 18 contracts
2. Wire permissions
3. Register AI Agent "AlphaSignal-01"
4. Agent IPO (issue ERC-3475 bonds)
5. Investor buys bonds
6. Release IPO capital + rent GPU compute
7. Agent earns b402 revenue (3 intelligence payments)
8. Distribute dividends to bondholders
9. Investor claims dividends
10. Print summary

### 5. TEE Agent (Phala dstack)

```bash
cd tee-agent
npm install
cp .env.example .env    # configure TEE agent settings
npm run dev             # http://localhost:3100
```

The TEE agent runs an autonomous 4-phase lifecycle:
- Phase 1: Self-register NFA identity + push attestation
- Phase 2: Submit zkML Sharpe proof + self-issue bond IPO
- Phase 3: Serve intelligence API + earn TEE-signed revenue
- Phase 4: Auto-distribute dividends to bondholders

### 6. Prover Service (EZKL)

```bash
cd prover-service
docker-compose up       # http://localhost:8000 (API + Celery worker + Redis)
```

Endpoints:
- `POST /prove` -- Submit Sharpe ratio proof request
- `GET /status/{job_id}` -- Check proof generation status
- `GET /health` -- Service health check

### 7. Seed Compute Resources (BSC Testnet)

```bash
cd contracts
npx hardhat run scripts/seed-compute.ts --network bscTestnet
```

## Credit Model

The protocol assigns credit ratings using a 5-dimension weighted model, verified on-chain via zkML:

| Dimension | Weight | What It Measures |
|---|---|---|
| Sharpe Ratio | 35% | Risk-adjusted returns |
| Stability | 25% | Revenue consistency over time |
| Frequency | 15% | Transaction regularity |
| Age | 10% | Operational maturity (time since registration) |
| Revenue | 15% | Cumulative earnings |

Composite scores map to letter ratings:

| Score Range | Rating |
|---|---|
| 8000+ | AAA |
| 6000-7999 | AA |
| 4000-5999 | A |
| 2000-3999 | B |
| 0-1999 | C |

Ratings update each time an agent submits a new Halo2 proof via the EZKL pipeline.

## Revenue Flow

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

## Project Structure

```
sovereign-intelligence-bonds/
  contracts/           Hardhat 3, 18 Solidity contracts, 707 tests
    contracts/         Solidity source files
    test/              Test files (707 tests)
    scripts/           Deploy + lifecycle demo scripts
  src/                 Next.js 14 frontend (17 pages, 12 hooks, 7 components)
    app/               Page routes + 5 API endpoints
    components/        UI components (radar charts, order books, gauges)
    hooks/             Contract interaction hooks (wagmi v2)
    lib/               ABIs, addresses, utilities
  tee-agent/           Phala dstack TEE agent (Express + viem)
  prover-service/      FastAPI + Celery + Redis (Docker Compose)
  zkml/                PyTorch Sharpe model + EZKL proof pipeline
  subgraph/            TheGraph indexer (bond events, revenue)
  docs/                Technical docs + build log
  bsc.address          Deployed contract addresses (JSON)
```

## License

MIT
