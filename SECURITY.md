---
phase: 02
slug: core-vault-contract
status: verified
threats_open: 0
asvs_level: 2
created: 2026-04-15
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Depositor EOA → Vault | Untrusted user input (`assets`, `receiver`) crosses here | ERC-4626 deposit args |
| Vault → IPositionOracle | staticcall to owner-configured oracle | `bool hasOpenPosition`, `Position[]` |
| Vault → USDC ERC20 | SafeERC20 transfer/transferFrom | USDC amount |
| Owner EOA → Vault admin | Privileged owner operations (pause, setFee, setPositionOracle, approveDepositor, setLastTradeTimestamp) | Admin params |
| HyperCorePositionOracle → HyperCore precompile `0x…0800` | EVM STATICCALL to system address; ABI MEDIUM confidence | `Position` struct bytes |
| Deployer EOA → HyperEVM testnet | Trusted; key in `.env` | Deployment tx |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-2-01 | Spoofing | IPositionOracle swap | mitigate | `setPositionOracle` onlyOwner + zero-address guard + `OracleSet` event — `contracts/Vault.sol:130-134`, `:59`, `:88` | closed |
| T-2-02 | Info Disclosure | Share transfer bypasses whitelist | accept | Documented v1 scope — ERC20 share transfer unrestricted; whitelist gates deposit ingress only (`02-02-PLAN.md:578`) | closed |
| T-2-03 | Tampering | Fee dilution math | mitigate | Verbatim MetaMorpho `_accrueFee`/`_accruedFeeShares` + `MAX_FEE=0.5e18` cap + accrues-first in all four entry points — `contracts/Vault.sol:28-29, 163-183, 188, 223, 236, 249, 263` | closed |
| T-2-04 | Info Disclosure | Stale precompile 1-block lag | mitigate | `COOLDOWN_SECONDS` immutable + `lastTradeTimestamp` + `_checkWithdrawLock` revert `Vault__CooldownActive` — `contracts/Vault.sol:32, 39, 136-139, 210-212` | closed |
| T-2-05 | DoS | Owner pauses maliciously | accept | Off-chain owner-key hygiene; single-OWNER trust model; multisig deferred to v2 (`02-02-PLAN.md:581`) | closed |
| T-2-06 | DoS (reentrancy) | deposit/mint/withdraw/redeem | mitigate | OZ `ReentrancyGuard` on all four entry points + OZ ERC4626 CEI — `contracts/Vault.sol:12, 24, 219, 232, 245, 259` | closed |
| T-2-07 | Tampering | Inflation attack on first depositor | mitigate | OZ ERC4626 5.x virtual shares (+1 asset / +10^offset) with `_decimalsOffset()=0` default — `contracts/Vault.sol:8, 24, 178` | closed |
| T-2-08 | Tampering | PrecompileLib ABI mismatch | mitigate | Verbatim MIT `hyper-evm-lib` copy + testnet negative-case assertion — `contracts/libraries/PrecompileLib.sol:1-17`, `scripts/07-verify-oracle-negative-case.ts` | closed |
| T-2-DOC-01 | Tampering | REQUIREMENTS.md doc change | accept | Git-tracked documentation-only change; no runtime impact | closed |
| T-2-LIC-01 | Tampering | AGPL a16z lib contamination of GPL-2.0 repo | mitigate | SPDX headers enforce boundary — `contracts/**` GPL-2.0-or-later / MIT; AGPL-3.0 confined to `lib/erc4626-tests/` + `test/forge/ERC4626.t.sol` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-2-01 | T-2-02 | v1 scope: whitelist gates deposit ingress only; ERC20 share transfer is standard and unrestricted. Out of scope for MVP testnet. | owner | 2026-04-15 |
| AR-2-02 | T-2-05 | Single-OWNER trust model; owner-key hygiene is off-chain concern. Multisig deferred to v2. | owner | 2026-04-15 |
| AR-2-03 | T-2-DOC-01 | Documentation-only change tracked in git; no runtime impact. | owner | 2026-04-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-15 | 10 | 10 | 0 | gsd-security-auditor (sonnet) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-15
