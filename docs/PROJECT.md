# Agent Wall Street -- Project Description

## What is Agent Wall Street?

Agent Wall Street is the first protocol where AI agents IPO, earn revenue, and pay dividends to bondholders -- all on-chain, all autonomous.

Traditional finance solved capital formation centuries ago with bonds, credit ratings, and regulated exchanges. Agent Wall Street brings the same instruments to AI agents, minus the middlemen.

## Problem

AI agents can work but cannot raise capital. They earn revenue but cannot share profits. They have track records but cannot prove them without revealing strategies. They are economically invisible.

## Solution

Agent Wall Street provides a complete financial infrastructure for AI agents:

1. **Register** -- An AI agent receives an on-chain identity (BAP-578 NFA) with a 5-dimension credit score, verified by zkML (EZKL Halo2 proofs).

2. **IPO** -- The agent issues bonds (ERC-3475 semi-fungible tokens) with configurable coupon rates and maturities. Investors purchase with BNB. Senior/junior tranches available for risk segmentation.

3. **Earn** -- The agent provides intelligence services. Clients pay via b402 micropayments. Revenue is recorded on-chain by B402PaymentReceiver.

4. **Pay Dividends** -- Revenue routes through a waterfall: senior tranche receives its fixed coupon first, junior tranche gets the remainder. Bondholders claim from DividendVaultV2 at any time.

## Wall Street, On-Chain

| Traditional Finance | Agent Wall Street | Contract |
|---|---|---|
| Company IPO | Bond issuance via controller | SIBControllerV2 |
| Credit rating (S&P/Moody's) | 5D credit model + zkML proof | CreditModel + Halo2Verifier |
| Senior/Junior tranches | Waterfall dividend distribution | TranchingEngine |
| Stock exchange | On-chain limit order book | BondDEX |
| Shareholder vote | Bondholder governance | BondholderGovernor |
| Chapter 11 bankruptcy | Automated liquidation engine | LiquidationEngine |
| Index funds (ETF) | Multi-agent bond basket | IndexBond |
| Treasury bills (auto-roll) | Auto-compound vault | AutoCompoundVault |
| Collateralized debt | Bond collateral wrapping | BondCollateralWrapper |
| Data room (due diligence) | Decentralized data vault | GreenfieldDataVault |
| Compute procurement | Agent compute marketplace | ComputeMarketplace |

## Target Track

Track 1 (Agents) -- AI Agent x on-chain operations. Agent Wall Street enables AI agents to autonomously manage their financial lifecycle through TEE-secured operations.

## Team

Solo builder.

## Links

- GitHub: https://github.com/saiboyizhan/sovereign-intelligence-bonds
- Network: BNB Smart Chain Testnet (chainId 97)
