import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployMocksFixture } from "./helpers/fixtures";

describe("MockPositionOracle (smoke)", () => {
  it("defaults hasOpenPosition() to false", async () => {
    const { oracle } = await loadFixture(deployMocksFixture);
    expect(await oracle.hasOpenPosition()).to.equal(false);
  });

  it("owner can flip hasOpenPosition", async () => {
    const { owner, oracle } = await loadFixture(deployMocksFixture);
    await oracle.connect(owner).setHasOpenPosition(true);
    expect(await oracle.hasOpenPosition()).to.equal(true);
  });

  it("non-owner cannot flip hasOpenPosition", async () => {
    const { alice, oracle } = await loadFixture(deployMocksFixture);
    await expect(oracle.connect(alice).setHasOpenPosition(true))
      .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
  });

  it("getPositions() defaults to empty and reflects setPositions", async () => {
    const { owner, oracle } = await loadFixture(deployMocksFixture);
    expect((await oracle.getPositions()).length).to.equal(0);

    await oracle.connect(owner).setPositions([
      { assetId: 0, szi: 1, entryNtl: 1000, leverage: 2 },
    ]);
    const ps = await oracle.getPositions();
    expect(ps.length).to.equal(1);
    expect(ps[0].assetId).to.equal(0);
  });
});
