import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployMocksFixture, deployVaultFixture, COOLDOWN_SECONDS_DEFAULT } from "./helpers/fixtures";

describe("Vault — deploy / constructor", () => {
  it("reverts on zero initialOwner", async () => {
    const { usdc, oracle, feeRecipient } = await loadFixture(deployMocksFixture);
    const Vault = await ethers.getContractFactory("Vault");
    await expect(
      Vault.deploy(
        ethers.ZeroAddress,
        await usdc.getAddress(),
        await oracle.getAddress(),
        feeRecipient.address,
        300
      )
    ).to.be.revertedWithCustomError(Vault, "OwnableInvalidOwner");
  });

  it("reverts on zero usdc", async () => {
    const { owner, oracle, feeRecipient } = await loadFixture(deployMocksFixture);
    const Vault = await ethers.getContractFactory("Vault");
    await expect(
      Vault.deploy(owner.address, ethers.ZeroAddress, await oracle.getAddress(), feeRecipient.address, 300)
    ).to.be.reverted;
  });

  it("reverts on zero oracle", async () => {
    const { owner, usdc, feeRecipient } = await loadFixture(deployMocksFixture);
    const Vault = await ethers.getContractFactory("Vault");
    await expect(
      Vault.deploy(owner.address, await usdc.getAddress(), ethers.ZeroAddress, feeRecipient.address, 300)
    ).to.be.revertedWithCustomError(Vault, "Vault__ZeroAddress");
  });

  it("reverts on zero feeRecipient", async () => {
    const { owner, usdc, oracle } = await loadFixture(deployMocksFixture);
    const Vault = await ethers.getContractFactory("Vault");
    await expect(
      Vault.deploy(owner.address, await usdc.getAddress(), await oracle.getAddress(), ethers.ZeroAddress, 300)
    ).to.be.revertedWithCustomError(Vault, "Vault__ZeroAddress");
  });

  it("happy path: exposes correct initial state", async () => {
    const { vault, oracle, feeRecipient, owner } = await loadFixture(deployVaultFixture);
    expect(await vault.fee()).to.equal(2n * 10n ** 17n); // 0.2e18
    expect(await vault.whitelistEnabled()).to.equal(false);
    expect(await vault.COOLDOWN_SECONDS()).to.equal(COOLDOWN_SECONDS_DEFAULT);
    expect(await vault.oracle()).to.equal(await oracle.getAddress());
    expect(await vault.feeRecipient()).to.equal(feeRecipient.address);
    expect(await vault.owner()).to.equal(owner.address);
    expect(await vault.name()).to.equal("Custom Vault Shares");
    expect(await vault.symbol()).to.equal("cvUSDC");
    expect(await vault.lastTradeTimestamp()).to.equal(0n);
    expect(await vault.lastTotalAssets()).to.equal(0n);
    expect(await vault.MAX_FEE()).to.equal(5n * 10n ** 17n);
  });
});
