// SPDX-License-Identifier: MIT
// Source: https://github.com/hyperliquid-dev/hyper-evm-lib (MIT)
// Trimmed: only the precompile addresses used by this project.
pragma solidity 0.8.28;

library HLConstants {
    /// @notice HyperCore perp-position read precompile address.
    address internal constant POSITION_PRECOMPILE_ADDRESS =
        0x0000000000000000000000000000000000000800;
}
