// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPositionOracle, Position} from "../interfaces/IPositionOracle.sol";
import {PrecompileLib} from "../libraries/PrecompileLib.sol";

/// @notice Production oracle reading HyperCore perp positions via precompile 0x...0800.
/// @dev The Vault address IS the HyperCore account address per HyperEVM bridging.
contract HyperCorePositionOracle is IPositionOracle, Ownable {
    uint256 public constant MAX_TRACKED_ASSETS = 32;

    address public immutable vault;
    uint16[] public assetIds;

    error HyperCoreOracle__TooManyAssets();
    error HyperCoreOracle__ZeroVault();

    event AssetIdsSet(uint16[] assetIds);

    constructor(address owner_, address vault_) Ownable(owner_) {
        if (vault_ == address(0)) revert HyperCoreOracle__ZeroVault();
        vault = vault_;
    }

    function setAssetIds(uint16[] calldata ids) external onlyOwner {
        if (ids.length > MAX_TRACKED_ASSETS) revert HyperCoreOracle__TooManyAssets();
        assetIds = ids;
        emit AssetIdsSet(ids);
    }

    function hasOpenPosition() external view returns (bool) {
        uint16[] memory ids = assetIds;
        for (uint256 i; i < ids.length; ++i) {
            PrecompileLib.Position memory p = PrecompileLib.position(vault, ids[i]);
            if (p.szi != 0) return true;
        }
        return false;
    }

    function getPositions() external view returns (Position[] memory out) {
        uint16[] memory ids = assetIds;
        out = new Position[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            PrecompileLib.Position memory p = PrecompileLib.position(vault, ids[i]);
            out[i] = Position({
                assetId: ids[i],
                szi: p.szi,
                entryNtl: p.entryNtl,
                leverage: p.leverage
            });
        }
    }
}
