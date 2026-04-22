/**
 * scripts/07-verify-oracle-negative-case.ts — live on-chain proof of D-21 / D-27 / T-2-08.
 *
 * Invocation:
 *   npx hardhat run scripts/07-verify-oracle-negative-case.ts --network hyperEvmTestnet
 *
 * Pre-requisites:
 *   .env contains VAULT_ADDRESS and ORACLE_ADDRESS (populated by 06-deploy-vault.ts).
 *
 * Behavior:
 *   1. Connect to HyperEVM testnet via hardhat signer (PRIVATE_KEY from .env).
 *   2. getPositions() pre-setAssetIds → expect empty.
 *   3. setAssetIds([0, 1, 2]) — three arbitrary perp asset IDs. The freshly
 *      deployed Vault's HyperCore account is empty, so szi must be 0 for all
 *      assets regardless of which IDs we track. Asset IDs do NOT need to match
 *      real Hyperliquid perps for the negative case.
 *   4. Wait ~1 block.
 *   5. hasOpenPosition() → MUST return false. If true → T-2-08 materialized,
 *      precompile ABI decode is wrong → halt and investigate.
 *   6. getPositions() → length 3, each szi==0.
 *   7. Exit 0 on success; non-zero on any failure.
 *
 * This script is the Task 4 human-checkpoint verification target — paste its
 * output into the plan SUMMARY when done.
 */
import { ethers, network } from "hardhat";
import "dotenv/config";

const ASSET_IDS: number[] = [0, 1, 2];

async function main() {
  if (network.name !== "hyperEvmTestnet") {
    console.warn(
      `[verify-oracle] WARNING: network is '${network.name}', expected 'hyperEvmTestnet'.`,
    );
  }

  const vaultAddr = process.env.VAULT_ADDRESS;
  const oracleAddr = process.env.ORACLE_ADDRESS;
  if (!vaultAddr || !oracleAddr) {
    throw new Error(
      "VAULT_ADDRESS / ORACLE_ADDRESS not set in .env. Run scripts/06-deploy-vault.ts first.",
    );
  }
  console.log("[verify-oracle] vault :", vaultAddr);
  console.log("[verify-oracle] oracle:", oracleAddr);

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer. Set PRIVATE_KEY in .env.");
  console.log("[verify-oracle] signer:", signer.address);

  const oracle = await ethers.getContractAt(
    "HyperCorePositionOracle",
    oracleAddr,
    signer,
  );

  // Step 1: baseline getPositions before any assetIds configured.
  const preAssetIds = await oracle.getPositions();
  console.log(
    "[verify-oracle] getPositions() pre-setAssetIds — length:",
    preAssetIds.length,
  );
  if (preAssetIds.length !== 0) {
    throw new Error(
      `Expected empty positions before setAssetIds, got ${preAssetIds.length}`,
    );
  }

  // Step 2: set three assetIds.
  console.log(
    "[verify-oracle] calling setAssetIds(",
    JSON.stringify(ASSET_IDS),
    ")...",
  );
  const tx = await oracle.setAssetIds(ASSET_IDS);
  console.log("[verify-oracle] setAssetIds tx:", tx.hash);
  await tx.wait(1);

  // Step 3: negative-case assertion.
  const hasOpen = await oracle.hasOpenPosition();
  if (hasOpen !== false) {
    console.error(
      "❌ hasOpenPosition returned TRUE for a freshly-deployed, empty HyperCore account.",
    );
    console.error(
      "   This indicates either (a) precompile ABI mismatch (T-2-08), " +
        "(b) decode error, or (c) stale state from a prior run. Halt phase.",
    );
    process.exit(2);
  }
  console.log("✅ hasOpenPosition: false");

  // Step 4: getPositions details.
  const positions = await oracle.getPositions();
  if (positions.length !== ASSET_IDS.length) {
    throw new Error(
      `Expected ${ASSET_IDS.length} positions, got ${positions.length}`,
    );
  }

  const formatted = positions.map((p) => ({
    assetId: Number(p.assetId),
    szi: p.szi.toString(),
    entryNtl: p.entryNtl.toString(),
    leverage: Number(p.leverage),
  }));
  console.log("✅ getPositions:", JSON.stringify(formatted));

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.szi !== 0n) {
      console.error(
        `❌ position[${i}] has non-zero szi=${p.szi} (assetId=${p.assetId}). Expected 0.`,
      );
      process.exit(3);
    }
    if (Number(p.assetId) !== ASSET_IDS[i]) {
      console.error(
        `❌ position[${i}] assetId=${p.assetId} != expected ${ASSET_IDS[i]}`,
      );
      process.exit(4);
    }
  }

  console.log(
    "✅ D-21 / D-27 / T-2-08 negative-case verified: precompile ABI decodes " +
      "a zero Position correctly for an empty HyperCore account.",
  );
}

main().catch((err) => {
  console.error("[verify-oracle] FAILED:", err);
  process.exit(1);
});
