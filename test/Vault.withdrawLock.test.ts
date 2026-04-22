import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, COOLDOWN_SECONDS_DEFAULT } from "./helpers/fixtures";

const USDC_UNIT = 10n ** 6n;

describe("Vault — withdraw-lock via oracle", () => {
  async function seeded() {
    const ctx = await loadFixture(deployVaultFixture);
    await ctx.vault.connect(ctx.alice).deposit(1000n * USDC_UNIT, ctx.alice.address);
    // advance time so cooldown is not active (lastTradeTimestamp==0 → auto-unlocked)
    await time.increase(COOLDOWN_SECONDS_DEFAULT + 1);
    return ctx;
  }

  it("oracle.hasOpenPosition()==false → withdraw succeeds", async () => {
    const { vault, oracle, owner, alice } = await seeded();
    await oracle.connect(owner).setHasOpenPosition(false);
    await expect(vault.connect(alice).withdraw(100n * USDC_UNIT, alice.address, alice.address)).to.not.be.reverted;
  });

  it("oracle.hasOpenPosition()==true → withdraw reverts Vault__OpenPositionBlocksWithdraw", async () => {
    const { vault, oracle, owner, alice } = await seeded();
    await oracle.connect(owner).setHasOpenPosition(true);
    await expect(
      vault.connect(alice).withdraw(100n * USDC_UNIT, alice.address, alice.address)
    ).to.be.revertedWithCustomError(vault, "Vault__OpenPositionBlocksWithdraw");
  });

  it("redeem also blocked when hasOpenPosition()==true (partial and full)", async () => {
    const { vault, oracle, owner, alice } = await seeded();
    await oracle.connect(owner).setHasOpenPosition(true);
    const shares = await vault.balanceOf(alice.address);
    await expect(vault.connect(alice).redeem(shares / 2n, alice.address, alice.address)).to.be.revertedWithCustomError(
      vault,
      "Vault__OpenPositionBlocksWithdraw"
    );
    await expect(vault.connect(alice).redeem(shares, alice.address, alice.address)).to.be.revertedWithCustomError(
      vault,
      "Vault__OpenPositionBlocksWithdraw"
    );
  });

  it("oracle reverts on hasOpenPosition → Vault__OracleUnavailable (try/catch fail-closed)", async () => {
    const { vault, owner, alice } = await seeded();
    const Reverting = await ethers.getContractFactory("RevertingOracle");
    const bad = await Reverting.deploy();
    await bad.waitForDeployment();
    await vault.connect(owner).setPositionOracle(await bad.getAddress());
    await expect(
      vault.connect(alice).withdraw(100n * USDC_UNIT, alice.address, alice.address)
    ).to.be.revertedWithCustomError(vault, "Vault__OracleUnavailable");
  });
});
