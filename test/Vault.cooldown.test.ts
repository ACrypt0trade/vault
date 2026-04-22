import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, COOLDOWN_SECONDS_DEFAULT } from "./helpers/fixtures";

const USDC_UNIT = 10n ** 6n;

describe("Vault — cooldown", () => {
  it("lastTradeTimestamp==0 → cooldown never blocks", async () => {
    const { vault, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    // No explicit time advance — default lastTradeTimestamp is 0.
    await expect(vault.connect(alice).withdraw(100n * USDC_UNIT, alice.address, alice.address)).to.not.be.reverted;
  });

  it("at COOLDOWN_SECONDS-1 → revert Vault__CooldownActive(1)", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);

    const ts = BigInt(await time.latest()) + 10n;
    await vault.connect(owner).setLastTradeTimestamp(ts);
    // jump to ts + COOLDOWN - 1
    const target = ts + BigInt(COOLDOWN_SECONDS_DEFAULT) - 1n;
    await time.setNextBlockTimestamp(target);
    await expect(vault.connect(alice).withdraw(100n * USDC_UNIT, alice.address, alice.address))
      .to.be.revertedWithCustomError(vault, "Vault__CooldownActive")
      .withArgs(1n);
  });

  it("at COOLDOWN_SECONDS → withdraw succeeds", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);

    const ts = BigInt(await time.latest()) + 10n;
    await vault.connect(owner).setLastTradeTimestamp(ts);
    const target = ts + BigInt(COOLDOWN_SECONDS_DEFAULT);
    await time.setNextBlockTimestamp(target);
    await expect(vault.connect(alice).withdraw(100n * USDC_UNIT, alice.address, alice.address)).to.not.be.reverted;
  });
});
