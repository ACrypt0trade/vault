import { ethers } from "hardhat";

/**
 * Deploys the non-Vault mocks (USDC, PositionOracle) and returns handles.
 * Consumers wrap this with `loadFixture(...)` from `@nomicfoundation/hardhat-network-helpers`.
 */
export async function deployMocksFixture() {
  const [owner, alice, bob, feeRecipient] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const MockPositionOracle = await ethers.getContractFactory("MockPositionOracle");
  const oracle = await MockPositionOracle.deploy(owner.address);
  await oracle.waitForDeployment();

  return { owner, alice, bob, feeRecipient, usdc, oracle };
}

export const COOLDOWN_SECONDS_DEFAULT = 300;
export const INITIAL_USDC = 1_000_000n * 10n ** 6n; // 1,000,000 USDC (6 decimals)

/**
 * Deploys MockUSDC + MockPositionOracle + Vault; mints 1,000,000 USDC to alice and bob
 * and pre-approves the Vault for MaxUint256. Whitelist is disabled by default.
 */
export async function deployVaultFixture() {
  const base = await deployMocksFixture();
  const { owner, alice, bob, feeRecipient, usdc, oracle } = base;

  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(
    owner.address,
    await usdc.getAddress(),
    await oracle.getAddress(),
    feeRecipient.address,
    COOLDOWN_SECONDS_DEFAULT
  );
  await vault.waitForDeployment();

  const vaultAddr = await vault.getAddress();
  await usdc.mint(alice.address, INITIAL_USDC);
  await usdc.mint(bob.address, INITIAL_USDC);
  await usdc.connect(alice).approve(vaultAddr, ethers.MaxUint256);
  await usdc.connect(bob).approve(vaultAddr, ethers.MaxUint256);

  return { owner, alice, bob, feeRecipient, usdc, oracle, vault };
}
