# Agent Wall Street

**Sovereign Intelligence Bonds (SIB) -- The first protocol where AI agents IPO, earn revenue, and pay dividends to bondholders.**

> AI agents are the new companies. They should be able to raise capital, prove their performance, and reward their investors -- all on-chain, all autonomous.

## The Problem

AI agents can work but cannot raise capital. They earn revenue but cannot share profits. They have track records but cannot prove them without revealing their strategies. They are economically invisible.

Traditional finance solved these problems centuries ago with bonds, credit ratings, and regulated exchanges. Agent Wall Street brings the same instruments to AI -- minus the middlemen.

## How Agent Wall Street Works

```
         REGISTER          IPO             EARN            PAY
         --------          ---             ----            ---
  Agent gets an       Agent issues      Agent sells     Revenue flows
  on-chain NFA        ERC-3475 bonds    intelligence    to bondholders
  with credit         to raise BNB      via x402        via waterfall
  history             from investors    micropayments   distribution

  [NFARegistry]    [SIBControllerV2]  [X402Receiver]  [DividendVaultV2]
       |                  |                |                |
       v                  v                v                v
  5D Credit Score    Senior/Junior     HTTP 402 ->      Claim BNB
  via zkML proof     tranche split     on-chain BNB     per bond held
```

1. **Register** -- An AI agent receives an on-chain identity (BAP-578 NFA) with a 5-dimension credit score, verified by zkML.
2. **IPO** -- The agent issues bonds (ERC-3475 semi-fungible tokens) with configurable coupon rates and maturities. Investors purchase with BNB.
3. **Earn** -- The agent provides intelligence services. Clients pay via x402 micropayments. Revenue is recorded on-chain by `X402PaymentReceiverV2`.
4. **Pay Dividends** -- Revenue routes through the waterfall: senior tranche receives its fixed coupon first, junior tranche gets the remainder. Bondholders claim from `DividendVaultV2`.

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
   | buy bonds (BNB)                   | sell intelligence (x402)
   v                                   v
SIBControllerV2  <----------->  X402PaymentReceiverV2
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
  CreditModel (5D scoring) --> SharpeVerifier (EZKL Halo2 on-chain)

TEE Layer:
  Phala dstack (Intel TDX) --> attestation + autonomous operations

Data Layer:
  GreenfieldDataVault --> encrypted agent performance data
```

## Deployed Contracts (BSC Testnet)

| Contract | Address |
|---|---|
| SIBControllerV2 | `0xD1B48E15Fa47B5AeA35A2f8327Bd8773fb4826d4` |
| SIBBondManager | `0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8` |
| NFARegistry | `0x802E67532B974ece533702311a66fEE000c1C325` |
| DividendVaultV2 | `0x66efb45Cd439CF3a216Df8682FFbebDc554729f1` |
| TranchingEngine | `0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595` |
| X402PaymentReceiverV2 | `0xFe053fFa3F3A873Bfc5f65E5000D4e4FcD4C8c1F` |
| Halo2Verifier | `0xad46573cEFE98dDcDB99e8c521fc094331B75f9d` |
| LiquidationEngine | `0xB0a1f8055bb7C276007ccc8E193719375D5b0418` |
| BondDEX | `0xB881e50fD22020a1774CAC535f00A77493350271` |
| BondholderGovernor | `0xdAe3DBC6e07d2C028D04aeCfe60084f4816b8135` |
| AutoCompoundVault | `0xbD1506A35aD79f076cd035a8312448E50718ad13` |
| IndexBond | `0x4ACDd6F2a9dB84ca5455529eC7F24b4BcC174F1f` |
| BondCollateralWrapper | `0xaA1D9058A9970a8C00abF768eff21e2c0B86Cf7B` |
| GreenfieldDataVault | `0x553e9ADF83df29aE84f9C1b4FA1505567cf421Cd` |
| ComputeMarketplace | `0x22bEa0382eb3295d2028bB9d5767DE73f52c2F5e` |
| TokenRegistry | `0xC5824Ce1cbfFC4A13C2C31191606407de100eB65` |
| TEERegistry | `0x29212A3E489236B56Ea4e383da78b6d2EF347Cf3` |

Network: BNB Smart Chain Testnet (chainId 97)

## Tech Stack

- **Contracts** -- Hardhat 3 + Solidity 0.8.28 + OpenZeppelin 5.4 -- 17 production contracts, 695 tests
- **zkML** -- EZKL framework (Halo2 proving system) -- verifiable Sharpe ratio proofs on-chain
- **TEE Agent** -- Phala dstack (Intel TDX) + Express -- autonomous agent with remote attestation
- **Frontend** -- Next.js 14 + wagmi v2 + RainbowKit + Tailwind CSS + recharts -- 11 pages, 5 API routes, 15 hooks
- **Prover** -- FastAPI + Celery + Redis -- real EZKL proof generation pipeline (Docker Compose)
- **Subgraph** -- TheGraph indexer for bond events and revenue tracking
- **Network** -- BNB Smart Chain Testnet

## Quick Start

### Frontend

```bash
npm install
npm run dev             # http://localhost:3000
npm run build           # production build
```

### Contracts

```bash
cd contracts
npm install
npx hardhat test        # 695 tests
npx hardhat compile
```

### TEE Agent

```bash
cd tee-agent
npm install
npm run dev             # http://localhost:3100
```

### Prover Service

```bash
cd prover-service
docker-compose up       # http://localhost:8000
```

### Deploy to BSC Testnet

```bash
cd contracts
PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network bscTestnet
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
  --> Client pays via x402 (BNB)
  --> X402PaymentReceiverV2 records payment on-chain
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
  contracts/           Hardhat 3, 17 Solidity contracts, 695 tests
  src/                 Next.js 14 frontend (11 pages, 15 hooks, 13 components)
    app/               Page routes + 5 API endpoints
    components/        UI components (radar charts, order books, gauges)
    hooks/             Contract interaction hooks (wagmi v2)
    lib/               ABIs, addresses, utilities
  tee-agent/           Phala dstack TEE agent (Express + viem)
  prover-service/      FastAPI + Celery + Redis (Docker Compose)
  zkml/                PyTorch Sharpe model + EZKL proof pipeline
  subgraph/            TheGraph indexer (bond events, revenue)
  bsc.address          Deployed contract addresses
```

## License

MIT
