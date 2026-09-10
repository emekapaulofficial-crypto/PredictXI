# StatKick

Premium mobile-first football statistics pool platform.

## Current build
- Professional dark forest/gold player interface
- Open pool cards and exactly-10 market selection experience
- Wallet and leaderboard surfaces
- All 20 specified football statistics markets represented
- Deterministic, configurable settlement engine in `settlement-engine.js`
- Settlement engine blocks incomplete/unofficial statistics instead of guessing
- Project metadata and lightweight local development script

## Production architecture
The frontend is intentionally separate from the future secure backend. Real-money wallet balances, payments, withdrawals, authentication, sports-data webhooks, settlement jobs and administrative permissions must be server-side.

## Critical production configuration
Before real-money launch, configure and approve:
- market thresholds
- winner-count formula
- payout percentages
- deterministic tie-breaker
- Diamond policy
- minimum/maximum pool rules
- lock interval
- sports-data provider and official statistics definition
- payment provider
- operating jurisdictions and licensing/compliance controls

Do not use the demo interface as a real-money system until those controls and the secure backend are implemented and tested.
