# Optional: Demo Video & Presentation

- **Demo video**: https://youtu.be/2U6ZM3DNpX4
- **Slide deck**: _(coming soon)_

---

# AI Build Log

This project was built primarily using **Claude Code** (Anthropic's CLI agent). Below is a record of how AI tools were used throughout development.

## Tools Used

| Tool | Usage |
|---|---|
| **Claude Code (Claude Opus)** | Primary development tool -- contract architecture, Solidity implementation, test writing, frontend development, TEE agent, deployment scripts, debugging, documentation |
| **EZKL** | zkML proof generation pipeline (PyTorch -> ONNX -> Halo2 proof -> Solidity verifier) |

## How AI Was Used

### Phase 1: Contract Architecture (5 base contracts, 206 tests)
- **AI role**: Designed the core contract architecture -- NFARegistry, SIBBondManager (ERC-3475), DividendVaultV2, SIBController, B402PaymentReceiver
- **Key decision**: AI recommended ERC-3475 over ERC-1155 for bond representation, citing native support for classId/nonceId structure and financial metadata fields
- **Key decision**: AI designed MasterChef accumulator pattern for O(1) gas dividend claims

### Phase 2: Financial Products (TranchingEngine, BondDEX, B402, 132 tests)
- **AI role**: Implemented senior/junior tranche waterfall, on-chain limit order book, b402 payment protocol
- **Key decision**: AI chose pull-over-push dividend model to prevent gas bombs and DoS vectors

### Phase 3: Advanced Features (Governor, Liquidation, AutoCompound, IndexBond, 116 tests)
- **AI role**: Built bondholder governance, liquidation engine, auto-compound vault, index bonds, collateral wrapper
- **Key decision**: AI designed credit-gated access for ComputeMarketplace -- agents need minimum credit rating to rent premium GPU resources

### Phase 4: zkML Pipeline (EZKL Halo2)
- **AI role**: Built PyTorch Sharpe ratio model, ONNX export, EZKL circuit configuration
- **AI role**: Designed prover service architecture (FastAPI + Celery + Redis)
- **Key decision**: AI recommended separating proof generation into async worker queue to prevent API timeouts

### Phase 5: Frontend (17 pages, 5 APIs, 12 hooks)
- **AI role**: Built complete Next.js 14 frontend with wagmi v2 hooks for all 18 contracts
- **AI role**: Designed warm dark financial aesthetic ("Agent Wall Street" theme)
- **Components**: 5D credit radar chart, bond order book, revenue area chart, dividend gauge

### Phase 6: E2E Integration (12 cross-contract scenarios)
- **AI role**: Designed and implemented full lifecycle integration tests

### Phase 7: Data Layer (GreenfieldDataVault, ComputeMarketplace, 114 tests)
- **AI role**: Built decentralized data vault for agent performance data, compute marketplace with credit gating

### Phase 8: TEE Integration (TEERegistry, TEE Agent, 46 tests)
- **AI role**: Implemented TEE wallet authorization, remote attestation, controller delegation
- **AI role**: Built autonomous TEE agent with 4-phase lifecycle (register -> IPO -> earn -> dividends)

### Phase 9: Pipeline Closure & Debugging
- **AI role**: Identified 6 pipeline gaps preventing end-to-end lifecycle closure
- **Fixes applied**:
  1. ComputeMarketplace had no seeded resources -- added `registerResource()` to deploy scripts
  2. zkML prover defaulted to simulated mode -- switched to `EZKL_MODE=real`
  3. Proof orchestrator used synthetic data -- replaced with real on-chain revenue reads
  4. Deploy scripts used MockVerifier -- switched to real Halo2Verifier
  5. TEE agent didn't wire dataVaultManager or revenueEngine -- connected both modules
  6. zkml/settings.json used UNSAFE check_mode -- changed to SAFE

### Phase 10: Deployment & Infrastructure
- **AI role**: Deployed all 18 contracts to BSC Testnet, configured Vercel deployment, managed domain setup
- **AI role**: Generated project logo (SIB branding with ascending bar chart motif)
- **AI role**: Set up Vercel team isolation for hackathon submission

## Build Stats

| Metric | Value |
|---|---|
| Contracts | 18 deployed on BSC Testnet |
| Tests | 707 passing |
| Frontend pages | 17 |
| API routes | 5 |
| Custom hooks | 12 |
| UI components | 7 |
| Deployer transactions | 100 on BSC Testnet |
| Lines of Solidity | ~4,000 |
| Total build phases | 10 |

## What AI Did vs What Human Did

| Task | Who |
|---|---|
| Product vision & direction | Human |
| Contract architecture & implementation | AI (Claude Code) |
| Test writing (707 tests) | AI (Claude Code) |
| Frontend design & implementation | AI (Claude Code) |
| zkML pipeline setup | AI (Claude Code) + EZKL |
| TEE agent implementation | AI (Claude Code) |
| Pipeline debugging & gap analysis | AI (Claude Code) |
| Deployment to BSC Testnet | AI (Claude Code) |
| Vercel deployment & domain setup | AI (Claude Code) |
| Logo generation | AI (Claude Code) |
| Hackathon submission prep | AI (Claude Code) |
