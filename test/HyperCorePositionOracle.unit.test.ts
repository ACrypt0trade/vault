import { expect } from "chai";
import { ethers, network } from "hardhat";

// HyperCore perp-position precompile address (matches HLConstants.POSITION_PRECOMPILE_ADDRESS).
const PRECOMPILE = "0x0000000000000000000000000000000000000800";
const VAULT_PLACEHOLDER = "0x000000000000000000000000000000000000dEaD";

type MockPos = {
  szi: bigint;
  entryNtl: bigint;
  isolatedRawUsd: bigint;
  leverage: number;
  isIsolated: boolean;
};

// Deploy MockPrecompileReturn(pos) to a throwaway address, grab its runtime code,
// then inject that code at the canonical precompile address via hardhat_setCode.
// Storage does NOT transfer with setCode — per-scenario state lives in immutables
// which ARE baked into the runtime bytecode.
async function injectMockPrecompile(pos: MockPos) {
  const Mock = await ethers.getContractFactory("MockPrecompileReturn");
  const tmp = await Mock.deploy(
    pos.szi,
    pos.entryNtl,
    pos.isolatedRawUsd,
    pos.leverage,
    pos.isIsolated,
  );
  await tmp.waitForDeployment();
  const code = await ethers.provider.getCode(await tmp.getAddress());
  await network.provider.send("hardhat_setCode", [PRECOMPILE, code]);
}

async function resetPrecompile() {
  await network.provider.send("hardhat_setCode", [PRECOMPILE, "0x"]);
}

async function deployOracle(vault: string = VAULT_PLACEHOLDER) {
  const [owner] = await ethers.getSigners();
  const Oracle = await ethers.getContractFactory("HyperCorePositionOracle");
  const oracle = await Oracle.deploy(owner.address, vault);
  await oracle.waitForDeployment();
  return oracle;
}

describe("HyperCorePositionOracle (unit, hardhat_setCode)", () => {
  afterEach(async () => {
    await resetPrecompile();
  });

  it("returns false when assetIds is empty", async () => {
    const oracle = await deployOracle();
    expect(await oracle.hasOpenPosition()).to.equal(false);
  });

  it("returns false when precompile szi==0", async () => {
    await injectMockPrecompile({
      szi: 0n,
      entryNtl: 0n,
      isolatedRawUsd: 0n,
      leverage: 0,
      isIsolated: false,
    });
    const oracle = await deployOracle();
    await oracle.setAssetIds([1]);
    expect(await oracle.hasOpenPosition()).to.equal(false);
  });

  it("returns true when precompile szi!=0 (single asset)", async () => {
    await injectMockPrecompile({
      szi: 5n,
      entryNtl: 1000n,
      isolatedRawUsd: 0n,
      leverage: 1,
      isIsolated: false,
    });
    const oracle = await deployOracle();
    await oracle.setAssetIds([1]);
    expect(await oracle.hasOpenPosition()).to.equal(true);
  });

  it("short-circuits on first non-zero szi across multiple assets", async () => {
    // Injected mock returns the same Position for every precompile call, so
    // scanning 3 assets with non-zero szi still exercises the loop + short-circuit.
    await injectMockPrecompile({
      szi: 7n,
      entryNtl: 2000n,
      isolatedRawUsd: 0n,
      leverage: 2,
      isIsolated: false,
    });
    const oracle = await deployOracle();
    await oracle.setAssetIds([10, 11, 12]);
    expect(await oracle.hasOpenPosition()).to.equal(true);

    const positions = await oracle.getPositions();
    expect(positions.length).to.equal(3);
    expect(positions[0].assetId).to.equal(10);
    expect(positions[0].szi).to.equal(7n);
    expect(positions[0].entryNtl).to.equal(2000n);
    expect(positions[0].leverage).to.equal(2);
  });

  it("getPositions returns empty array when assetIds is empty", async () => {
    const oracle = await deployOracle();
    const positions = await oracle.getPositions();
    expect(positions.length).to.equal(0);
  });

  it("rejects assetIds.length > MAX_TRACKED_ASSETS", async () => {
    const oracle = await deployOracle();
    const big = Array.from({ length: 33 }, (_, i) => i);
    await expect(oracle.setAssetIds(big)).to.be.revertedWithCustomError(
      oracle,
      "HyperCoreOracle__TooManyAssets",
    );
  });

  it("accepts assetIds.length == MAX_TRACKED_ASSETS (boundary)", async () => {
    const oracle = await deployOracle();
    const atMax = Array.from({ length: 32 }, (_, i) => i);
    await expect(oracle.setAssetIds(atMax)).to.emit(oracle, "AssetIdsSet");
  });

  it("non-owner cannot setAssetIds", async () => {
    const [, alice] = await ethers.getSigners();
    const oracle = await deployOracle();
    await expect(
      oracle.connect(alice).setAssetIds([1]),
    ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
  });

  it("zero vault in constructor reverts", async () => {
    const [owner] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("HyperCorePositionOracle");
    await expect(
      Oracle.deploy(owner.address, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(Oracle, "HyperCoreOracle__ZeroVault");
  });
});
