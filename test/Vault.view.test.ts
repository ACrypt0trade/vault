import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture } from "./helpers/fixtures";

describe("Vault — view surface", () => {
  it("totalAssets equals USDC balance of the vault before and after deposit", async () => {
    const { vault, usdc, alice } = await loadFixture(deployVaultFixture);
    const vaultAddr = await vault.getAddress();
    expect(await vault.totalAssets()).to.equal(0n);
    expect(await usdc.balanceOf(vaultAddr)).to.equal(0n);

    const amount = 1000n * 10n ** 6n;
    await vault.connect(alice).deposit(amount, alice.address);
    expect(await vault.totalAssets()).to.equal(amount);
    expect(await usdc.balanceOf(vaultAddr)).to.equal(amount);
  });

  it("convertToShares / convertToAssets round-trip is within 1 wei", async () => {
    const { vault, alice } = await loadFixture(deployVaultFixture);
    const amount = 1000n * 10n ** 6n;
    await vault.connect(alice).deposit(amount, alice.address);

    const shares = await vault.convertToShares(amount);
    const back = await vault.convertToAssets(shares);
    const diff = amount > back ? amount - back : back - amount;
    expect(diff).to.be.lte(1n);
  });

  it("oracle() passthrough returns mock address", async () => {
    const { vault, oracle } = await loadFixture(deployVaultFixture);
    expect(await vault.oracle()).to.equal(await oracle.getAddress());
  });

  it("asset() returns the USDC mock address", async () => {
    const { vault, usdc } = await loadFixture(deployVaultFixture);
    expect(await vault.asset()).to.equal(await usdc.getAddress());
  });

  it("decimals follows ERC4626 (asset decimals + _decimalsOffset=0 → 6)", async () => {
    const { vault } = await loadFixture(deployVaultFixture);
    expect(await vault.decimals()).to.equal(6n);
  });
});
