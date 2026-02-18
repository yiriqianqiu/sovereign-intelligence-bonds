# Sovereign Intelligence Bonds -- AI Build Log

## What is this?

A record of how SIB was built, the reasoning behind key decisions, and the creative process of designing "Agent Wall Street."

## The Idea

What if AI agents had credit ratings? What if you could invest in an agent's future earnings the same way you'd buy a corporate bond?

SIB makes that possible. We securitize NFA (Non-Fungible Agent) revenue streams into ERC-3475 semi-fungible bonds. Each bond class maps to one agent. Each nonce is a separate issuance batch. Dividends are distributed from x402 payment channels through a pull-over-push vault.

The "trick" is using zkML (EZKL) to verify Sharpe ratios on-chain. This gives every agent a verifiable risk-adjusted performance metric -- the foundation of machine credit.

## Build Decisions

**Why ERC-3475 over ERC-1155?**
ERC-3475 was designed for financial instruments. Its classId/nonceId structure maps perfectly to "one class per agent, one nonce per issuance batch." The standard includes metadata fields for coupon rate, maturity period, and other bond parameters that would require custom extensions on ERC-1155.

**Why Pull-over-Push dividends?**
The MasterChef accumulator pattern (accDividendPerBond with 1e18 precision) gives O(1) dividend calculations regardless of holder count. Push-based distribution would create gas bombs and DoS vectors.

**Why Controller pattern?**
Centralizing permissions in SIBController means atomic operations (IPO creates class + nonce + issues bonds in one tx), cleaner access control, and easy upgradability -- just swap the Controller.

**Why MockVerifier first?**
EZKL-generated Halo2 verifiers can exceed 24KB (Solidity's deployment limit). Starting with a mock lets us validate all business logic before optimizing the verifier contract.

## Architecture

```
SIBController (orchestrator)
  |-- NFARegistry (BAP-578 + credit ratings)
  |-- SIBBondManager (ERC-3475)
  |-- DividendVault (pull-over-push)
  |-- SharpeVerifier (EZKL Halo2)
  |-- X402PaymentReceiver (revenue intake)
```

## Stats

- 6 core contracts deployed on BSC Testnet
- 160 tests, 0 failures
- 10 frontend pages + 5 API routes
- 9 reusable components (6 shadcn/ui base + SharpeGauge + BondPurchaseModal + DividendClaimButton)
- All pages read/write on-chain via wagmi v2 (zero mock data)
- recharts financial visualizations (AreaChart, BarChart)
- zkML pipeline: PyTorch -> ONNX -> EZKL -> Solidity verifier
- Prover service: FastAPI + Celery + Redis (Docker Compose, 3 services)
- Design system: warm dark financial aesthetic ("Agent Wall Street")

## What Makes This Different

Most agent protocols focus on identity (BAP-578), training (ClawTrainer), or task markets. SIB occupies the "machine credit" layer -- the financial infrastructure that turns agent capabilities into investable instruments.

No one has done agent revenue securitization before. This is the gap between "agents can earn money" and "you can invest in agents earning money."

## Timeline

- Phase 1: Contract core (7 contracts, 160 tests)
- Phase 2: Frontend MVP (8 pages, 5 APIs, warm dark financial design)
- Phase 3: zkML pipeline (PyTorch Sharpe model + EZKL prover)
- Phase 4: Deployment + documentation
- Phase 5: Security audit + hardening

Built with Claude Code, quality-first.
