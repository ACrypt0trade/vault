// SPDX-License-Identifier: MIT
// Source: https://github.com/hyperliquid-dev/hyper-evm-lib (MIT)
// Trimmed: only the position() read wrapper used by HyperCorePositionOracle.
pragma solidity 0.8.28;

import {HLConstants} from "./HLConstants.sol";

library PrecompileLib {
    /// @notice Raw precompile return struct for perp positions.
    /// @dev 5-field layout as published by hyper-evm-lib main branch 2026-04-15.
    struct Position {
        int64 szi;
        uint64 entryNtl;
        int64 isolatedRawUsd;
        uint32 leverage;
        bool isIsolated;
    }

    error PrecompileLib__PositionPrecompileFailed();

    /// @notice staticcalls the position precompile for (user, perp) and decodes the result.
    /// @dev Input encoding is `abi.encode(user, perp)` — NOT encodePacked.
    function position(address user, uint16 perp) internal view returns (Position memory) {
        (bool success, bytes memory result) =
            HLConstants.POSITION_PRECOMPILE_ADDRESS.staticcall(abi.encode(user, perp));
        if (!success) revert PrecompileLib__PositionPrecompileFailed();
        return abi.decode(result, (Position));
    }
}
