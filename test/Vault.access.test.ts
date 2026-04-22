import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture } from "./helpers/fixtures";

describe("Vault — access control (owner-only surface)", () => {
  it("non-owner reverts OwnableUnauthorizedAccount on all 10 owner-only calls", async () => {
    const { vault, alice, oracle, feeRecipient } = await loadFixture(deployVaultFixture);
    const nonOwner = alice;

    const calls: Array<[string, Promise<any>]> = [
      ["approveDepositor", vault.connect(nonOwner).approveDepositor(alice.address)],
      ["revokeDepositor", vault.connect(nonOwner).revokeDepositor(alice.address)],
      ["approveDepositors", vault.connect(nonOwner).approveDepositors([alice.address])],
      ["setWhitelistEnabled", vault.connect(nonOwner).setWhitelistEnabled(true)],
      ["setPositionOracle", vault.connect(nonOwner).setPositionOracle(await oracle.getAddress())],
      ["setLastTradeTimestamp", vault.connect(nonOwner).setLastTradeTimestamp(123)],
      ["pause", vault.connect(nonOwner).pause()],
      ["unpause", vault.connect(nonOwner).unpause()],
      ["setFee", vault.connect(nonOwner).setFee(10n ** 17n)],
      ["setFeeRecipient", vault.connect(nonOwner).setFeeRecipient(feeRecipient.address)],
    ];

    for (const [name, tx] of calls) {
      await expect(tx, `${name} must be owner-gated`)
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
        .withArgs(nonOwner.address);
    }
  });
});
