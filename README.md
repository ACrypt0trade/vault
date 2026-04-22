# Custom Vault for Hyperliquid — Submission Package

A headless ERC-4626 Vault deployed on HyperEVM testnet (chain 998), denominated in USDC, with three custom business rules. This README targets the Hyperliquid dev team reviewing the contract for inclusion in the HyperCore vault registry. It is paired with `COVER-LETTER.md` and shipped inside `custom-vault-submission.zip`.

## Overview

This package contains a custom ERC-4626 Vault built on HyperEVM chain 998. The Vault is USDC-denominated (6 decimals on the EVM side; `0x2B3370eE501B4a559b57D449569354196457D8Ab`), stateless with respect to HyperCore execution, and reads open-position state via a dedicated oracle contract that queries the HyperCore perp-position precompile (`0x...0800`).

Deployed Vault: [`0xF40AE1fddD06b96cF12e6c939fCD3Fc68D2e79c0`](https://testnet.purrsec.com/address/0xF40AE1fddD06b96cF12e6c939fCD3Fc68D2e79c0). Three custom rules apply: a toggleable deposit whitelist (default disabled), a global performance fee implemented via MetaMorpho-style share dilution, and position-locked withdrawals with a 300-second trade cooldown.

This submission exists because Phase 01 of the project empirically established that the standard Hyperliquid Vaults UI does not read HyperEVM RPC — it queries the HyperCore native registry plus Arbitrum Sepolia for wallet EVM balances, so custom HyperEVM Vaults are architecturally invisible to the standard UI. See the Security Posture section for the full statement; manual registry listing is the only route to UI surfacing.

## Business Rules

| Rule | Rationale | Enforcement |
|------|-----------|-------------|
| Toggleable deposit whitelist | Per-operator permissioning when the operator wants it; default open for broad access | `approved` mapping + `whitelistEnabled` bool; `maxDeposit(receiver)` returns `0` when whitelist enabled and receiver not approved, which makes ERC-4626 `deposit`/`mint` revert by standard preview-check |
| Global performance fee via share dilution | Performance-aligned operator compensation without per-user accounting; copies the MetaMorpho HWM pattern | `_accrueFee()` mints shares to `feeRecipient` when `totalAssets > lastTotalAssets`; called before every state-mutating path. Cap: `MAX_FEE = 50% WAD`, default `20% WAD` |
| Position-locked withdrawals + cooldown | Prevent withdrawals while the Vault holds open HyperCore positions or during the stale-oracle window after a trade | `withdraw` / `redeem` revert with `Vault__OpenPositionBlocksWithdraw` if `oracle.hasOpenPosition()`, or `Vault__CooldownActive(remaining)` if `block.timestamp - lastTradeTimestamp < COOLDOWN_SECONDS` |

## Architecture & Composition

```
+--------------------------------------------------------------+
|                         Vault.sol                            |
|   (GPL-2.0-or-later; ~150 SLOC original glue)                |
|                                                              |
|   +-- OpenZeppelin 5.6.1 (MIT) -----------------------+      |
|   |   ERC4626 | Ownable | ReentrancyGuard             |      |
|   |   Pausable | SafeERC20 | Math                     |      |
|   +----------------------------------------------------+      |
|                                                              |
|   +-- MetaMorpho (GPL-2.0-or-later) -------------------+      |
|   |   _accrueFee / _accruedFeeShares  (copied 1:1)     |      |
|   +----------------------------------------------------+      |
|                                                              |
|   +-- IPositionOracle (MIT, original) -----------------+      |
|   |         ^                                          |      |
|   +---------|------------------------------------------+      |
|             |                                                |
+-------------|------------------------------------------------+
              |
              v
+--------------------------------------------------------------+
|             HyperCorePositionOracle.sol (MIT)                |
|   uses hyper-evm-lib PrecompileLib.position()  (MIT, 1:1)    |
|         --> HyperCore precompile 0x...0800                   |
+--------------------------------------------------------------+
```

SLOC breakdown:

| Component | Source | License | Approx SLOC |
|-----------|--------|---------|-------------|
| OZ `ERC4626`, `Ownable`, `ReentrancyGuard`, `Pausable`, `SafeERC20`, `Math` | `@openzeppelin/contracts@5.6.1` | MIT | external (npm) |
| `_accrueFee` / `_accruedFeeShares` fee math | MetaMorpho (`morpho-org/metamorpho`) | GPL-2.0-or-later | ~40 (verbatim) |
| `PrecompileLib.position()` | `hyper-evm-lib` | MIT | ~20 (verbatim) |
| Vault glue (whitelist, fee integration, withdraw-lock, cooldown) | Original | GPL-2.0-or-later (forced by MetaMorpho copy) | ~150 |
| `HyperCorePositionOracle` | Original | MIT | ~60 |

Audit-surface rationale: the original glue code totals ~150 SLOC. The bulk of the code path runs through audited primitives (OpenZeppelin 5.6.1 ERC-4626 family and MetaMorpho fee math), keeping the incremental review surface small.

## ERC-4626 Interface

### Methods

Standard ERC-4626 surface with deltas from the stock OZ implementation:

| Method | Delta from stock ERC-4626 |
|--------|----------------------------|
| `deposit(assets, receiver)` | Gated by whitelist when `whitelistEnabled` and `!approved[receiver]` (via `maxDeposit`) |
| `mint(shares, receiver)` | Same whitelist gate via `maxMint` |
| `withdraw(assets, receiver, owner)` | Reverts `Vault__OpenPositionBlocksWithdraw` if oracle reports an open position; reverts `Vault__CooldownActive` inside the trade cooldown window |
| `redeem(shares, receiver, owner)` | Same withdraw-side gates |
| `maxDeposit(receiver)` | Returns `0` if whitelist enabled and receiver not approved |
| `maxMint(receiver)` | Returns `0` if whitelist enabled and receiver not approved |
| `maxWithdraw(owner)` | Returns `0` when position open or cooldown active |
| `maxRedeem(owner)` | Returns `0` when position open or cooldown active |
| `totalAssets()` | Standard (balance of underlying held by Vault) |
| `convertToShares` / `convertToAssets` | Standard (rounding uses `Math.Rounding` per OZ) |

### Events

| Event | Signature | Purpose |
|-------|-----------|---------|
| `Deposit` | inherited from `IERC4626` | ERC-4626 deposit |
| `Withdraw` | inherited from `IERC4626` | ERC-4626 withdraw |
| `DepositorApproved` | `(address indexed depositor)` | Whitelist add |
| `DepositorRevoked` | `(address indexed depositor)` | Whitelist remove |
| `WhitelistToggled` | `(bool enabled)` | Toggle whitelist gate |
| `OracleSet` | `(IPositionOracle indexed oracle)` | Oracle address rotation |
| `LastTradeTimestampSet` | `(uint64 timestamp)` | Operator declared trade moment |
| `FeeAccrued` | `(uint256 newTotalAssets, uint256 feeShares)` | Perf fee share dilution |
| `FeeSet` | `(address indexed caller, uint96 newFee)` | Fee rate change |
| `FeeRecipientSet` | `(address indexed caller, address newRecipient)` | Fee recipient rotation |
| `Paused` / `Unpaused` | inherited from `Pausable` | Emergency stop |

### Custom Errors

| Error | Triggered when |
|-------|----------------|
| `Vault__ZeroAddress()` | Constructor or setter receives `address(0)` |
| `Vault__WhitelistEmpty()` | Attempt to enable whitelist with an empty approved set |
| `Vault__MaxFeeExceeded()` | `setFee` receives a value > `MAX_FEE` (50% WAD) |
| `Vault__OpenPositionBlocksWithdraw()` | Withdraw attempted while `oracle.hasOpenPosition()` is true |
| `Vault__CooldownActive(uint256 remaining)` | Withdraw attempted inside the trade cooldown window |
| `Vault__OracleUnavailable()` | Oracle call failed (no data) |
| `Vault__AlreadySet()` | Setter called with the currently-active value |
| `Vault__ZeroFeeRecipient()` | `setFeeRecipient(address(0))` |

## Roles & Access Control

Single OWNER role. There is no multi-sig or multi-role ACL split in v1. OWNER = deployer = `0xDbFaA33921919CB5c48d323D047e461eDc05B383` (per D-16; no key rotation for this submission). OWNER-gated entry points:

| Function | Effect |
|----------|--------|
| `approveDepositor(address)` | Add an address to the deposit whitelist |
| `revokeDepositor(address)` | Remove an address from the deposit whitelist |
| `setWhitelistEnabled(bool)` | Toggle the whitelist gate (disabled by default) |
| `setFee(uint96)` | Set the performance-fee rate (WAD; capped at `MAX_FEE`) |
| `setFeeRecipient(address)` | Rotate the fee recipient |
| `setPositionOracle(IPositionOracle)` | Rotate the position oracle |
| `setLastTradeTimestamp(uint64)` | Operator declares a trade moment, starting the cooldown |
| `pause()` | Emergency stop — blocks all deposits and withdrawals |
| `unpause()` | Resume operation |

## Configuration & Constants

| Constant | Value | Source |
|----------|-------|--------|
| `MAX_FEE` | `0.5e18` (50% WAD) | Hardcoded cap in `Vault.sol` |
| default fee | `0.2e18` (20% WAD) | Constructor body |
| `COOLDOWN_SECONDS` | `300` | Constructor arg (see `deployments/hyperEvmTestnet-Vault.json`) |
| whitelist default | `false` (open) | Constructor |
| asset | USDC (6 decimals on EVM) | `0x2B3370eE501B4a559b57D449569354196457D8Ab` |
| share name / symbol | `Custom Vault Shares` / `cvUSDC` | Constructor |

## Deployment

Chain 998 (HyperEVM testnet). All three addresses are cross-referenced with `deployments/hyperEvmTestnet-Vault.json` (the single source of truth for this submission; validation script `check-addresses.sh` asserts this).

| Artifact | Address | Tx | Purrsec |
|----------|---------|----|---------|
| Vault | `0xF40AE1fddD06b96cF12e6c939fCD3Fc68D2e79c0` | `0xda8e846e66ff563e8d0668745c349d1b99e87c6d92a67785eb1055534383d53c` | [link](https://testnet.purrsec.com/address/0xF40AE1fddD06b96cF12e6c939fCD3Fc68D2e79c0) |
| Oracle | `0xdDbb95595a188B7590535D7E601CA32E1e003eD7` | `0xc755863224651cb50903355a96863d1fd56877ed88223c698416ade1f00b1a02` | [link](https://testnet.purrsec.com/address/0xdDbb95595a188B7590535D7E601CA32E1e003eD7) |
| Owner | `0xDbFaA33921919CB5c48d323D047e461eDc05B383` | — | [link](https://testnet.purrsec.com/address/0xDbFaA33921919CB5c48d323D047e461eDc05B383) |

Gas used: Vault `2,061,736` / Oracle `642,322` at `0.1 gwei` (bigBlock). Block number: `50931886`. Deploy timestamp: `2026-04-15T10:26:03Z`.

Sourcify note: public source verification via Sourcify is blocked — chain 998 is not indexed by the public Sourcify instance (HTTP 500 on upload). The archive is source-reproducible with pinned Solidity `0.8.28` + `evmVersion: cancun`; SHA-256 of the archive is deterministic across rebuilds (see `scripts/validation/check-reproducible.sh`).

## Testing & Validation

| Suite | Result | Command |
|-------|--------|---------|
| Hardhat unit tests | 76/76 passed | `npm test` |
| a16z `erc4626-tests` (Foundry, 256 runs) | 26/26 passed | `forge test --match-path test/forge/ERC4626.t.sol` |
| Phase 02 UAT | 12/12 passed | see `.planning/phases/02-core-vault-contract/02-UAT.md` |

Additional: testnet on-chain negative-case oracle verification executed against the deployed Oracle and passed (confirmed `hasOpenPosition()==false` for the Vault's HyperCore index while spot balances were zero; used as a sanity check before submission).

## Security Posture

ASVS Level 2 self-assessment. Threat register (see `./package/SECURITY.md` for the full model): 10 identified threats, 10 closed, 0 open. Key mitigations: single OWNER boundary with explicit per-function gating, `ReentrancyGuard` on all four ERC-4626 entry points, `Pausable` emergency stop on both directions, `SafeERC20` at every transfer boundary, `MAX_FEE` cap preventing arbitrary-high fees, oracle-gated withdraw path with explicit revert on missing data (`Vault__OracleUnavailable`), cooldown window to absorb the HyperCore↔HyperEVM 1-block precompile lag.

The original glue code (~150 SLOC) has not yet undergone third-party audit. The bulk of logic leverages audited primitives (OpenZeppelin 5.6.1 and MetaMorpho `_accrueFee`).

Phase 01 empirically established that the standard Hyperliquid Vaults UI does not read HyperEVM RPC — it queries the HyperCore native registry and Arbitrum Sepolia for wallet EVM balances. Custom HyperEVM contracts are thus architecturally invisible to the standard UI; manual registry listing is the only route to UI surfacing.

## License Composition

This package is distributed under **GPL-2.0-or-later** as a combined work. Per-file origins:

| Component | Origin | SPDX | Note |
|-----------|--------|------|------|
| `Vault.sol` | Original + MetaMorpho `_accrueFee` verbatim | GPL-2.0-or-later | Forced by MetaMorpho (morpho-org/metamorpho) GPL-2.0-or-later copy |
| `HyperCorePositionOracle.sol` | Original | MIT | Our code; no derivative obligation |
| `IPositionOracle.sol` | Original | MIT | Our code |
| `PrecompileLib.sol` | hyper-evm-lib | MIT | Verbatim copy, attribution in file header |
| `HLConstants.sol` | hyper-evm-lib | MIT | Verbatim copy |
| `@openzeppelin/contracts@5.6.1` | OpenZeppelin | MIT | Referenced via `package.json`; not bundled in archive |

**Combined-work license:** GPL-2.0-or-later because `Vault.sol` copies GPL-2.0-or-later code. MIT-licensed files retain MIT headers and remain MIT-licensed; MIT is GPL-compatible.

## Future Work

- Third-party audit of the original glue code (~150 SLOC) prior to mainnet migration
- Mainnet deployment to HyperEVM chain 999 post-audit
- CoreWriter integration (trade execution from the Vault) — Phase 04 scope
- Multi-depositor E2E scenarios with HyperCore state round-trips — Phase 04 scope
- Optional multi-role ACL split (operator vs. owner vs. pauser) for a v2 release
