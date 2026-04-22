import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture } from "./helpers/fixtures";

const USDC_UNIT = 10n ** 6n;

describe("Vault — pause blocks all four entry points", () => {
  it("pause() then deposit/mint/withdraw/redeem all revert EnforcedPause; unpause restores", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    // seed a deposit before pausing so withdraw has something to redeem
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);

    await vault.connect(owner).pause();

    await expect(vault.connect(alice).deposit(1n, alice.address)).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause"
    );
    await expect(vault.connect(alice).mint(1n, alice.address)).to.be.revertedWithCustomError(vault, "EnforcedPause");
    await expect(
      vault.connect(alice).withdraw(1n, alice.address, alice.address)
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    await expect(
      vault.connect(alice).redeem(1n, alice.address, alice.address)
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");

    await vault.connect(owner).unpause();
    await expect(vault.connect(alice).deposit(1n, alice.address)).to.not.be.reverted;
  });
});
