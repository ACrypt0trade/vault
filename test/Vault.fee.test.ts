import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture } from "./helpers/fixtures";

const WAD = 10n ** 18n;
const MAX_FEE = WAD / 2n;
const USDC_UNIT = 10n ** 6n;

describe("Vault — fee (MetaMorpho dilution)", () => {
  it("setFee(0) is allowed even with non-zero feeRecipient", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setFee(0n)).to.emit(vault, "FeeSet").withArgs(owner.address, 0n);
    expect(await vault.fee()).to.equal(0n);
  });

  it("setFee(MAX_FEE + 1) reverts Vault__MaxFeeExceeded", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setFee(MAX_FEE + 1n)).to.be.revertedWithCustomError(
      vault,
      "Vault__MaxFeeExceeded"
    );
  });

  it("setFee(current) reverts Vault__AlreadySet", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    const current = await vault.fee();
    await expect(vault.connect(owner).setFee(current)).to.be.revertedWithCustomError(vault, "Vault__AlreadySet");
  });

  it("setFee accrues-first: fee minted on prior profit uses OLD fee, not new", async () => {
    const { vault, usdc, owner, alice, feeRecipient } = await loadFixture(deployVaultFixture);
    // seed vault with a first deposit so shares exist
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    // lastTotalAssets is now set to 1000e6

    // simulate profit: mint 100 USDC directly to vault
    const profit = 100n * USDC_UNIT;
    await usdc.mint(await vault.getAddress(), profit);

    const feeBefore = await vault.fee(); // 0.2e18
    const feeRecipBalBefore = await vault.balanceOf(feeRecipient.address);
    expect(feeRecipBalBefore).to.equal(0n);

    // set a higher fee; _accrueFee must run BEFORE mutating fee
    await vault.connect(owner).setFee(4n * 10n ** 17n); // 0.4e18

    const feeRecipBalAfter = await vault.balanceOf(feeRecipient.address);
    expect(feeRecipBalAfter).to.be.gt(0n);

    // Recompute expected feeShares with OLD fee (0.2e18):
    //   totalInterest = 100e6
    //   feeAssets = 100e6 * 0.2e18 / 1e18 = 20e6
    //   totalSupply after alice deposit = 1000e6 shares (offset=0 → shares == assets in 6 decimals)
    //   feeShares = 20e6 * (1000e6 + 1) / (1100e6 - 20e6 + 1) = 20e6 * 1000000001 / 1080000001
    const totalInterest = profit;
    const feeAssets = (totalInterest * feeBefore) / WAD;
    const totalSupply = 1000n * USDC_UNIT; // shares minted 1:1 before dilution
    const num = feeAssets * (totalSupply + 1n); // decimalsOffset=0 → 10^0 = 1
    const den = 1100n * USDC_UNIT - feeAssets + 1n;
    const expected = num / den;
    expect(feeRecipBalAfter).to.equal(expected);
    // and the new fee value is stored
    expect(await vault.fee()).to.equal(4n * 10n ** 17n);
  });

  it("no fee on loss: feeRecipient gets 0 shares when totalAssets <= lastTotalAssets", async () => {
    const { vault, alice, feeRecipient } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    expect(await vault.balanceOf(feeRecipient.address)).to.equal(0n);
    // second deposit (no profit between) should not accrue fee
    await vault.connect(alice).deposit(500n * USDC_UNIT, alice.address);
    expect(await vault.balanceOf(feeRecipient.address)).to.equal(0n);
  });

  it("HWM: second profit accrues only on delta above prior lastTotalAssets", async () => {
    const { vault, usdc, alice, feeRecipient } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);

    // Profit #1: +100, then a new deposit of 1 wei triggers _accrueFee
    await usdc.mint(await vault.getAddress(), 100n * USDC_UNIT);
    await vault.connect(alice).deposit(1n, alice.address);
    const bal1 = await vault.balanceOf(feeRecipient.address);
    expect(bal1).to.be.gt(0n);

    // No further profit → next deposit should not mint new fee shares
    await vault.connect(alice).deposit(1n, alice.address);
    const bal2 = await vault.balanceOf(feeRecipient.address);
    expect(bal2).to.equal(bal1);
  });

  it("deposit updates lastTotalAssets to totalAssets()", async () => {
    const { vault, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    expect(await vault.lastTotalAssets()).to.equal(1000n * USDC_UNIT);
  });
});
