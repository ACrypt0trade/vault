import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture } from "./helpers/fixtures";

const MAX = ethers.MaxUint256;

describe("Vault — whitelist", () => {
  it("default: whitelistEnabled=false, any receiver has unlimited maxDeposit", async () => {
    const { vault, alice, bob } = await loadFixture(deployVaultFixture);
    expect(await vault.whitelistEnabled()).to.equal(false);
    expect(await vault.maxDeposit(alice.address)).to.equal(MAX);
    expect(await vault.maxDeposit(bob.address)).to.equal(MAX);
    expect(await vault.maxMint(alice.address)).to.equal(MAX);
  });

  it("approve + enable: approved receiver can deposit; non-approved cannot", async () => {
    const { vault, owner, alice, bob } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositor(alice.address);
    await vault.connect(owner).setWhitelistEnabled(true);

    expect(await vault.maxDeposit(alice.address)).to.equal(MAX);
    expect(await vault.maxDeposit(bob.address)).to.equal(0n);
  });

  it("setWhitelistEnabled(true) reverts Vault__WhitelistEmpty when no approved depositors", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setWhitelistEnabled(true)).to.be.revertedWithCustomError(
      vault,
      "Vault__WhitelistEmpty"
    );
  });

  it("enabling after first approval succeeds", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositor(alice.address);
    await expect(vault.connect(owner).setWhitelistEnabled(true)).to.emit(vault, "WhitelistToggled").withArgs(true);
    expect(await vault.whitelistEnabled()).to.equal(true);
  });

  it("revoke decrements count; re-enabling after full revoke reverts", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositor(alice.address);
    expect(await vault.approvedCount()).to.equal(1n);
    await vault.connect(owner).revokeDepositor(alice.address);
    expect(await vault.approvedCount()).to.equal(0n);
    await expect(vault.connect(owner).setWhitelistEnabled(true)).to.be.revertedWithCustomError(
      vault,
      "Vault__WhitelistEmpty"
    );
  });

  it("approveDepositor is idempotent (second call no-op, no double count)", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositor(alice.address);
    await vault.connect(owner).approveDepositor(alice.address);
    expect(await vault.approvedCount()).to.equal(1n);
  });

  it("batch approveDepositors approves all addresses", async () => {
    const { vault, owner, alice, bob } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositors([alice.address, bob.address]);
    expect(await vault.approved(alice.address)).to.equal(true);
    expect(await vault.approved(bob.address)).to.equal(true);
    expect(await vault.approvedCount()).to.equal(2n);
  });

  it("setWhitelistEnabled(same) is a no-op, no event", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setWhitelistEnabled(false)).to.not.emit(vault, "WhitelistToggled");
  });
});
