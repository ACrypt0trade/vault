// SPDX-License-Identifier: GPL-2.0-or-later
// Vault composition: OZ 5.6.1 (MIT) + MetaMorpho _accrueFee (GPL-2.0-or-later) + custom whitelist/cooldown.
// Copying MetaMorpho fee math (morpho-org/metamorpho, GPL-2.0-or-later) makes this file GPL-2.0-or-later.
// MetaMorpho attribution: https://github.com/morpho-org/metamorpho — _accrueFee / _accruedFeeShares pattern
// copied verbatim (Task 2).
pragma solidity 0.8.28;

import {ERC4626, IERC20, IERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPositionOracle, Position} from "./interfaces/IPositionOracle.sol";

/// @title Vault — headless ERC-4626 vault for Hyperliquid with whitelist, performance fee and withdraw-lock.
/// @notice Custom rules:
///         1. Toggleable whitelist on deposits (disabled by default).
///         2. Global performance fee (WAD, default 20%, cap 50%) via MetaMorpho-style dilution on profit only.
///         3. Withdraw is blocked while `IPositionOracle.hasOpenPosition()` is true.
///         4. Withdraw is blocked during COOLDOWN_SECONDS after `lastTradeTimestamp`.
/// @dev Non-upgradeable, single-owner, pausable. All four public entry points are nonReentrant + whenNotPaused.
contract Vault is ERC4626, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ---------- Constants ----------
    uint256 internal constant WAD = 1e18;
    uint256 public constant MAX_FEE = 0.5e18;

    // ---------- Immutable state ----------
    uint256 public immutable COOLDOWN_SECONDS;

    // ---------- Mutable state ----------
    uint96 public fee;
    address public feeRecipient;
    uint256 public lastTotalAssets;
    IPositionOracle public oracle;
    uint64 public lastTradeTimestamp;

    bool public whitelistEnabled;
    mapping(address => bool) public approved;
    uint256 private _approvedCount;

    // ---------- Errors ----------
    error Vault__ZeroAddress();
    error Vault__WhitelistEmpty();
    error Vault__MaxFeeExceeded();
    error Vault__OpenPositionBlocksWithdraw();
    error Vault__CooldownActive(uint256 remaining);
    error Vault__OracleUnavailable();
    error Vault__AlreadySet();
    error Vault__ZeroFeeRecipient();

    // ---------- Events ----------
    event DepositorApproved(address indexed depositor);
    event DepositorRevoked(address indexed depositor);
    event WhitelistToggled(bool enabled);
    event OracleSet(IPositionOracle indexed oracle);
    event LastTradeTimestampSet(uint64 timestamp);
    event FeeAccrued(uint256 newTotalAssets, uint256 feeShares);
    event FeeSet(address indexed caller, uint96 newFee);
    event FeeRecipientSet(address indexed caller, address newRecipient);

    constructor(
        address initialOwner,
        IERC20 usdc,
        IPositionOracle oracle_,
        address feeRecipient_,
        uint256 cooldownSeconds_
    )
        ERC4626(usdc)
        ERC20("Custom Vault Shares", "cvUSDC")
        Ownable(initialOwner)
    {
        if (
            initialOwner == address(0) ||
            address(usdc) == address(0) ||
            address(oracle_) == address(0) ||
            feeRecipient_ == address(0)
        ) {
            revert Vault__ZeroAddress();
        }
        oracle = oracle_;
        feeRecipient = feeRecipient_;
        fee = uint96(0.2e18);
        COOLDOWN_SECONDS = cooldownSeconds_;
        emit OracleSet(oracle_);
    }

    // ---------- Whitelist admin ----------
    function approveDepositor(address d) public onlyOwner {
        if (!approved[d]) {
            approved[d] = true;
            unchecked {
                ++_approvedCount;
            }
            emit DepositorApproved(d);
        }
    }

    function revokeDepositor(address d) public onlyOwner {
        if (approved[d]) {
            approved[d] = false;
            unchecked {
                --_approvedCount;
            }
            emit DepositorRevoked(d);
        }
    }

    function approveDepositors(address[] calldata ds) external onlyOwner {
        for (uint256 i = 0; i < ds.length; ++i) {
            approveDepositor(ds[i]);
        }
    }

    function setWhitelistEnabled(bool v) external onlyOwner {
        if (v == whitelistEnabled) return;
        if (v && _approvedCount == 0) revert Vault__WhitelistEmpty();
        whitelistEnabled = v;
        emit WhitelistToggled(v);
    }

    function approvedCount() external view returns (uint256) {
        return _approvedCount;
    }

    // ---------- Oracle / cooldown admin ----------
    function setPositionOracle(IPositionOracle o) external onlyOwner {
        if (address(o) == address(0)) revert Vault__ZeroAddress();
        oracle = o;
        emit OracleSet(o);
    }

    function setLastTradeTimestamp(uint64 ts) external onlyOwner {
        lastTradeTimestamp = ts;
        emit LastTradeTimestampSet(ts);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------- View overrides ----------
    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused()) return 0;
        if (!whitelistEnabled) return type(uint256).max;
        return approved[receiver] ? type(uint256).max : 0;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        if (paused() || (whitelistEnabled && !approved[receiver])) return 0;
        return type(uint256).max;
    }

    // ---------- Fee accrual (MetaMorpho pattern, GPL-2.0-or-later) ----------
    /// @dev Copied 1:1 from https://github.com/morpho-org/metamorpho (_accrueFee pattern).
    function _accrueFee() internal returns (uint256 newTotalAssets) {
        uint256 feeShares;
        (feeShares, newTotalAssets) = _accruedFeeShares();
        if (feeShares != 0) _mint(feeRecipient, feeShares);
        emit FeeAccrued(newTotalAssets, feeShares);
    }

    /// @dev Copied 1:1 from MetaMorpho.
    function _accruedFeeShares() internal view returns (uint256 feeShares, uint256 newTotalAssets) {
        newTotalAssets = totalAssets();
        uint256 totalInterest = newTotalAssets > lastTotalAssets ? newTotalAssets - lastTotalAssets : 0;
        if (totalInterest != 0 && fee != 0) {
            uint256 feeAssets = Math.mulDiv(totalInterest, fee, WAD);
            feeShares = Math.mulDiv(
                feeAssets,
                totalSupply() + 10 ** _decimalsOffset(),
                newTotalAssets - feeAssets + 1,
                Math.Rounding.Floor
            );
        }
    }

    // ---------- Fee admin ----------
    function setFee(uint256 newFee) external onlyOwner {
        if (newFee == fee) revert Vault__AlreadySet();
        if (newFee > MAX_FEE) revert Vault__MaxFeeExceeded();
        if (newFee != 0 && feeRecipient == address(0)) revert Vault__ZeroFeeRecipient();
        lastTotalAssets = _accrueFee();
        fee = uint96(newFee);
        emit FeeSet(_msgSender(), fee);
    }

    function setFeeRecipient(address r) external onlyOwner {
        if (r == feeRecipient) revert Vault__AlreadySet();
        if (r == address(0) && fee != 0) revert Vault__ZeroFeeRecipient();
        lastTotalAssets = _accrueFee();
        feeRecipient = r;
        emit FeeRecipientSet(_msgSender(), r);
    }

    // ---------- Withdraw-lock helper ----------
    function _checkWithdrawLock() internal view {
        try oracle.hasOpenPosition() returns (bool hasOpen) {
            if (hasOpen) revert Vault__OpenPositionBlocksWithdraw();
        } catch {
            revert Vault__OracleUnavailable();
        }
        if (lastTradeTimestamp != 0 && block.timestamp < uint256(lastTradeTimestamp) + COOLDOWN_SECONDS) {
            revert Vault__CooldownActive(uint256(lastTradeTimestamp) + COOLDOWN_SECONDS - block.timestamp);
        }
    }

    // ---------- Public ERC4626 entry point overrides ----------
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        _accrueFee();
        uint256 shares = super.deposit(assets, receiver);
        lastTotalAssets = totalAssets();
        return shares;
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        _accrueFee();
        uint256 assets = super.mint(shares, receiver);
        lastTotalAssets = totalAssets();
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        _accrueFee();
        _checkWithdrawLock();
        uint256 shares = super.withdraw(assets, receiver, owner_);
        lastTotalAssets = totalAssets();
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        _accrueFee();
        _checkWithdrawLock();
        uint256 assets = super.redeem(shares, receiver, owner_);
        lastTotalAssets = totalAssets();
        return assets;
    }
}
