import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, COOLDOWN_SECONDS_DEFAULT } from "./helpers/fixtures";

const USDC_UNIT = 10n ** 6n;
const MAX_FEE = 5n * 10n ** 17n;

describe("Vault — custom error selectors", () => {
  it("Vault__ZeroAddress (constructor)", async () => {
    const { usdc, oracle, feeRecipient } = await loadFixture(deployVaultFixture);
    const Vault = await ethers.getContractFactory("Vault");
    await expect(
      Vault.deploy(
        (await ethers.getSigners())[0].address,
        await usdc.getAddress(),
        ethers.ZeroAddress,
        feeRecipient.address,
        300
      )
    ).to.be.revertedWithCustomError(Vault, "Vault__ZeroAddress");
  });

  it("Vault__WhitelistEmpty", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setWhitelistEnabled(true)).to.be.revertedWithCustomError(
      vault,
      "Vault__WhitelistEmpty"
    );
  });

  it("Vault__MaxFeeExceeded", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setFee(MAX_FEE + 1n)).to.be.revertedWithCustomError(
      vault,
      "Vault__MaxFeeExceeded"
    );
  });

  it("Vault__OpenPositionBlocksWithdraw", async () => {
    const { vault, oracle, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    await oracle.connect(owner).setHasOpenPosition(true);
    await expect(
      vault.connect(alice).withdraw(1n, alice.address, alice.address)
    ).to.be.revertedWithCustomError(vault, "Vault__OpenPositionBlocksWithdraw");
  });

  it("Vault__CooldownActive(remaining) — arg matches deterministic computation", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);

    const ts = BigInt(await time.latest()) + 10n;
    await vault.connect(owner).setLastTradeTimestamp(ts);
    const target = ts + BigInt(COOLDOWN_SECONDS_DEFAULT) - 5n;
    await time.setNextBlockTimestamp(target);
    await expect(vault.connect(alice).withdraw(1n, alice.address, alice.address))
      .to.be.revertedWithCustomError(vault, "Vault__CooldownActive")
      .withArgs(5n);
  });

  it("Vault__OracleUnavailable", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    await time.increase(COOLDOWN_SECONDS_DEFAULT + 1);
    const Rev = await ethers.getContractFactory("RevertingOracle");
    const bad = await Rev.deploy();
    await bad.waitForDeployment();
    await vault.connect(owner).setPositionOracle(await bad.getAddress());
    await expect(vault.connect(alice).withdraw(1n, alice.address, alice.address)).to.be.revertedWithCustomError(
      vault,
      "Vault__OracleUnavailable"
    );
  });

  it("Vault__AlreadySet (setFee on same value)", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    const current = await vault.fee();
    await expect(vault.connect(owner).setFee(current)).to.be.revertedWithCustomError(vault, "Vault__AlreadySet");
  });

  it("Vault__ZeroFeeRecipient (setFeeRecipient(0) with non-zero fee)", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    // fee default is 0.2e18 ≠ 0; setting recipient to zero must revert
    await expect(vault.connect(owner).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      vault,
      "Vault__ZeroFeeRecipient"
    );
  });

  it("OwnableUnauthorizedAccount (inherited) surfaces with caller arg", async () => {
    const { vault, alice } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(alice).pause())
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });
});
