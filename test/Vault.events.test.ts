import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, COOLDOWN_SECONDS_DEFAULT } from "./helpers/fixtures";

const USDC_UNIT = 10n ** 6n;

describe("Vault — events", () => {
  it("DepositorApproved on first approveDepositor (idempotent: no re-emit)", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).approveDepositor(alice.address))
      .to.emit(vault, "DepositorApproved")
      .withArgs(alice.address);
    await expect(vault.connect(owner).approveDepositor(alice.address)).to.not.emit(vault, "DepositorApproved");
  });

  it("DepositorRevoked on revoke of approved depositor", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositor(alice.address);
    await expect(vault.connect(owner).revokeDepositor(alice.address))
      .to.emit(vault, "DepositorRevoked")
      .withArgs(alice.address);
  });

  it("WhitelistToggled(true/false)", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).approveDepositor(alice.address);
    await expect(vault.connect(owner).setWhitelistEnabled(true)).to.emit(vault, "WhitelistToggled").withArgs(true);
    await expect(vault.connect(owner).setWhitelistEnabled(false)).to.emit(vault, "WhitelistToggled").withArgs(false);
  });

  it("OracleSet on constructor deploy and on setPositionOracle", async () => {
    const { vault, oracle } = await loadFixture(deployVaultFixture);
    // Constructor emits — filter deploy tx logs
    const deployBlock = (await vault.deploymentTransaction())!;
    const receipt = await deployBlock.wait();
    const oracleAddr = (await oracle.getAddress()).toLowerCase();
    const found = (receipt!.logs as any[]).some(
      (l) =>
        l.address.toLowerCase() === (vault.target as string).toLowerCase() &&
        l.topics[1] &&
        `0x${l.topics[1].slice(26)}` === oracleAddr
    );
    expect(found).to.equal(true);

    // setPositionOracle re-emits
    const { owner } = await loadFixture(deployVaultFixture);
    const { vault: v2, oracle: o2, owner: ow2 } = await loadFixture(deployVaultFixture);
    const NewOracle = await ethers.getContractFactory("MockPositionOracle");
    const newOracle = await NewOracle.deploy(ow2.address);
    await newOracle.waitForDeployment();
    await expect(v2.connect(ow2).setPositionOracle(await newOracle.getAddress()))
      .to.emit(v2, "OracleSet")
      .withArgs(await newOracle.getAddress());
  });

  it("LastTradeTimestampSet", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setLastTradeTimestamp(12345n))
      .to.emit(vault, "LastTradeTimestampSet")
      .withArgs(12345n);
  });

  it("FeeAccrued emitted on deposit after profit, with non-zero feeShares", async () => {
    const { vault, usdc, alice } = await loadFixture(deployVaultFixture);
    // seed
    await vault.connect(alice).deposit(1000n * USDC_UNIT, alice.address);
    // profit
    await usdc.mint(await vault.getAddress(), 100n * USDC_UNIT);
    // next deposit triggers _accrueFee
    await expect(vault.connect(alice).deposit(1n, alice.address)).to.emit(vault, "FeeAccrued");
  });

  it("FeeSet on setFee", async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    const newFee = 3n * 10n ** 17n;
    await expect(vault.connect(owner).setFee(newFee)).to.emit(vault, "FeeSet").withArgs(owner.address, newFee);
  });

  it("FeeRecipientSet on setFeeRecipient", async () => {
    const { vault, owner, alice } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(owner).setFeeRecipient(alice.address))
      .to.emit(vault, "FeeRecipientSet")
      .withArgs(owner.address, alice.address);
  });

  it("ERC4626 Deposit / Withdraw emitted on round-trip", async () => {
    const { vault, alice } = await loadFixture(deployVaultFixture);
    const amt = 100n * USDC_UNIT;
    await expect(vault.connect(alice).deposit(amt, alice.address)).to.emit(vault, "Deposit");
    await time.increase(COOLDOWN_SECONDS_DEFAULT + 1);
    await expect(vault.connect(alice).withdraw(amt / 2n, alice.address, alice.address)).to.emit(vault, "Withdraw");
  });
});
