// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice View-facing position snapshot used by IPositionOracle.getPositions().
/// @dev Distinct from PrecompileLib.Position (raw precompile struct with 5 fields);
///      this trimmed 4-field view is the consumer-facing representation.
struct Position {
    uint16 assetId;
    int64 szi;
    uint64 entryNtl;
    uint32 leverage;
}

/// @notice Oracle contract consumed by the Vault to enforce withdraw-lock.
/// @dev hasOpenPosition() is on the critical withdraw path; getPositions() is for display/TVL.
interface IPositionOracle {
    /// @return True if the Vault has any non-zero perp position size on HyperCore.
    function hasOpenPosition() external view returns (bool);

    /// @return Array of position snapshots (one per tracked asset).
    function getPositions() external view returns (Position[] memory);
}
