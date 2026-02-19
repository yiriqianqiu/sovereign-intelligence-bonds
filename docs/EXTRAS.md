# Agent Wall Street -- Additional Information

## Design Decisions

### Why ERC-3475 (not ERC-20 or ERC-721)?

ERC-3475 is a semi-fungible bond standard that supports multiple classes and nonces within a single contract. This is critical for Agent Wall Street because:
- Each agent can have multiple bond classes (different coupon rates, maturities)
- Each class can have multiple nonces (issuance batches)
- Bonds of the same class/nonce are fungible (tradeable on BondDEX)
- Different classes can represent senior vs junior tranches
- Gas-efficient batch operations for transfers and redemptions

### Why zkML for Credit Ratings?

Traditional DeFi credit scores rely on on-chain history that can be gamed. Agent Wall Street uses EZKL (Halo2 proving system) to generate zero-knowledge proofs of Sharpe ratios:
- Agent submits off-chain performance data to the prover service
- Prover generates a Halo2 proof that the claimed Sharpe ratio is correct
- On-chain Halo2Verifier validates the proof without seeing raw data
- This prevents strategy leakage while maintaining verifiable credit ratings

### Why TEE (Trusted Execution Environment)?

Without TEE, all agent operations require human signatures -- creating moral hazard (fake revenue, strategy manipulation). TEE provides:
- Hardware-level isolation (Intel TDX via Phala dstack)
- Remote attestation (cryptographic proof the code hasn't been tampered with)
- Deterministic execution (same inputs always produce same outputs)
- Key derivation from hardware (TEE wallet cannot be extracted)

### Why MasterChef-style Dividends?

DividendVaultV2 uses a MasterChef accumulator pattern for O(1) gas dividend claims regardless of the number of distribution events. Without this, claiming dividends after 1000 distributions would require iterating through each one.

## Security Considerations

- **Relay restriction**: B402PaymentReceiver has an optional relay whitelist to prevent fake revenue injection. When `relayRestricted` is true, only authorized TEE relays can submit payments.
- **TEE attestation freshness**: getTEEStatus returns `isActive = false` if the last attestation is older than 24 hours, alerting investors that the TEE may be offline.
- **Liquidation grace period**: LiquidationEngine provides a configurable grace period before execution, giving agents time to recover.
- **Bondholder governance**: BondholderGovernor allows bondholders to vote on parameter changes (coupon rates, collateral requirements) with a quorum threshold.

## Test Coverage

707 tests across all contracts:
- Unit tests for each contract in isolation
- Integration tests for cross-contract workflows (IPO -> purchase -> revenue -> dividend -> claim)
- TEE delegation tests (authorized TEE wallet can act on behalf of agent owner)
- Edge cases: zero amounts, unauthorized access, reentrancy guards, overflow protection

## Demo Lifecycle

The `contracts/scripts/demo-lifecycle.ts` script demonstrates the full Agent Wall Street lifecycle in 9 steps:

1. Deploy all contracts locally
2. Wire permissions
3. Register AI agent "AlphaSignal-01"
4. Agent IPO: issue 100 bonds at 0.01 BNB each, 5% coupon
5. Investor buys 10 bonds (0.1 BNB)
6. Agent earns 0.03 BNB via 3 b402 intelligence payments
7. Distribute dividends (70% to bondholders, 30% to agent owner)
8. Investor claims 0.021 BNB in dividends
9. Print summary

Run: `cd contracts && npx hardhat run scripts/demo-lifecycle.ts`

## Future Roadmap

- Mainnet deployment with real EZKL Halo2 verifier
- TheGraph subgraph deployment for indexed queries
- Cross-chain bond trading via LayerZero
- Agent reputation system with on-chain performance history
- Institutional-grade bond analytics dashboard
