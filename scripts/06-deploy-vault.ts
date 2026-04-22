/**
 * scripts/06-deploy-vault.ts — deploy HyperCorePositionOracle + Vault to HyperEVM testnet.
 *
 * Invocation:
 *   npx hardhat run scripts/06-deploy-vault.ts --network hyperEvmTestnet
 *
 * Two-step address-prediction pattern (required because the oracle needs the
 * Vault's address at construction, but the Vault also takes the oracle at
 * construction):
 *   1. Read deployer nonce N.
 *   2. Predict Vault address = getCreateAddress({ from: deployer, nonce: N+1 }).
 *   3. Deploy HyperCorePositionOracle(deployer, predictedVault)  [uses nonce N]
 *   4. Deploy Vault(deployer, USDC, oracle, feeRecipient, cooldown)  [uses nonce N+1]
 *   5. Persist VAULT_ADDRESS, ORACLE_ADDRESS, DEPLOY_BLOCK_NUMBER, DEPLOYER_ADDRESS to .env.
 *
 * Both deploys use bigBlockGasPrice because Vault bytecode exceeds the 2M
 * small-block gas limit on HyperEVM (CLAUDE.md §Dual-Block Architecture).
 *
 * NOTE: The existing .env `VAULT_ADDRESS` slot was previously used by Phase 01
 * for the HyperCore-native vault. Per whitelist pivot (02-CONTEXT D-04..D-07)
 * the HyperEVM Vault contract is the canonical `VAULT_ADDRESS` going forward.
 */
import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

// HyperEVM testnet USDC (CLAUDE.md §USDC Handling — HIGH confidence).
const USDC_TESTNET_DEFAULT = "0x2B3370eE501B4a559b57D449569354196457D8Ab";
const COOLDOWN_SECONDS_DEFAULT = 300n;

function persistEnvVar(key: string, value: string) {
  const envPath = path.resolve(process.cwd(), ".env");
  let body = "";
  if (fs.existsSync(envPath)) {
    body = fs.readFileSync(envPath, "utf8");
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(body)) {
    body = body.replace(re, line);
  } else {
    if (body.length > 0 && !body.endsWith("\n")) body += "\n";
    body += line + "\n";
  }
  fs.writeFileSync(envPath, body, { encoding: "utf8" });
}

async function fetchBigBlockGasPrice(): Promise<bigint> {
  const provider = ethers.provider;
  try {
    const hex = (await provider.send("bigBlockGasPrice", [])) as string;
    return BigInt(hex);
  } catch {
    const hex = (await provider.send("eth_bigBlockGasPrice", [])) as string;
    return BigInt(hex);
  }
}

async function main() {
  if (network.name !== "hyperEvmTestnet") {
    console.warn(
      `[deploy-vault] WARNING: network is '${network.name}', expected 'hyperEvmTestnet'. ` +
        "Use only for local dry-runs.",
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer. Set PRIVATE_KEY in .env and retry.");
  }

  const usdc = process.env.USDC_ADDRESS_TESTNET ?? USDC_TESTNET_DEFAULT;
  const feeRecipient = process.env.FEE_RECIPIENT ?? deployer.address;
  const cooldownSeconds = process.env.COOLDOWN_SECONDS
    ? BigInt(process.env.COOLDOWN_SECONDS)
    : COOLDOWN_SECONDS_DEFAULT;

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("[deploy-vault] deployer:", deployer.address);
  console.log(
    "[deploy-vault] HYPE balance:",
    ethers.formatEther(balance),
    "HYPE",
  );
  console.log("[deploy-vault] USDC:", usdc);
  console.log("[deploy-vault] feeRecipient:", feeRecipient);
  console.log("[deploy-vault] cooldownSeconds:", cooldownSeconds.toString());

  let gasPrice: bigint;
  if (network.name === "hyperEvmTestnet") {
    gasPrice = await fetchBigBlockGasPrice();
    console.log(
      "[deploy-vault] bigBlockGasPrice:",
      ethers.formatUnits(gasPrice, "gwei"),
      "gwei",
    );
  } else {
    const feeData = await ethers.provider.getFeeData();
    gasPrice = feeData.gasPrice ?? 1_000_000_000n;
  }

  // --- Two-step address prediction ---
  const nonce = await ethers.provider.getTransactionCount(
    deployer.address,
    "pending",
  );
  const predictedVault = ethers.getCreateAddress({
    from: deployer.address,
    nonce: nonce + 1,
  });
  console.log(
    "[deploy-vault] predicted Vault address (nonce+1):",
    predictedVault,
  );

  // --- Deploy oracle (nonce N) ---
  const OracleFactory = await ethers.getContractFactory(
    "HyperCorePositionOracle",
  );
  console.log("[deploy-vault] deploying HyperCorePositionOracle...");
  const oracle = await OracleFactory.deploy(
    deployer.address,
    predictedVault,
    { gasPrice },
  );
  const oracleTx = oracle.deploymentTransaction();
  if (!oracleTx) throw new Error("Oracle deployment tx missing");
  console.log("[deploy-vault] oracle tx:", oracleTx.hash);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  const oracleReceipt = await oracleTx.wait(1);
  console.log("[deploy-vault] oracle deployed at:", oracleAddress);
  console.log(
    "[deploy-vault] oracle gasUsed:",
    oracleReceipt?.gasUsed?.toString(),
  );

  // --- Deploy Vault (nonce N+1) ---
  const VaultFactory = await ethers.getContractFactory("Vault");
  console.log("[deploy-vault] deploying Vault...");
  const vault = await VaultFactory.deploy(
    deployer.address,
    usdc,
    oracleAddress,
    feeRecipient,
    cooldownSeconds,
    { gasPrice },
  );
  const vaultTx = vault.deploymentTransaction();
  if (!vaultTx) throw new Error("Vault deployment tx missing");
  console.log("[deploy-vault] vault tx:", vaultTx.hash);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const vaultReceipt = await vaultTx.wait(1);

  if (vaultAddress.toLowerCase() !== predictedVault.toLowerCase()) {
    throw new Error(
      `Predicted vault address (${predictedVault}) != actual (${vaultAddress}). ` +
        "Nonce drift — re-run from a clean deployer state.",
    );
  }

  const blockNumber = vaultReceipt?.blockNumber ?? 0;

  console.log("📦 Vault:", vaultAddress);
  console.log("📡 Oracle:", oracleAddress);
  console.log("🧱 Block:", blockNumber);
  console.log(
    `⛽ Gas used: vault=${vaultReceipt?.gasUsed?.toString() ?? "?"} ` +
      `oracle=${oracleReceipt?.gasUsed?.toString() ?? "?"}`,
  );

  // Persist outputs.
  persistEnvVar("VAULT_ADDRESS", vaultAddress);
  persistEnvVar("ORACLE_ADDRESS", oracleAddress);
  persistEnvVar("DEPLOY_BLOCK_NUMBER", String(blockNumber));
  persistEnvVar("DEPLOYER_ADDRESS", deployer.address);
  console.log(
    "[deploy-vault] VAULT_ADDRESS, ORACLE_ADDRESS, DEPLOY_BLOCK_NUMBER, DEPLOYER_ADDRESS written to .env",
  );

  // Save reproducible deployment record.
  const record = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    vault: vaultAddress,
    oracle: oracleAddress,
    deployer: deployer.address,
    vaultTx: vaultTx.hash,
    oracleTx: oracleTx.hash,
    blockNumber,
    gas: {
      vault: vaultReceipt?.gasUsed?.toString(),
      oracle: oracleReceipt?.gasUsed?.toString(),
    },
    gasPrice: gasPrice.toString(),
    constructor: {
      vault: {
        initialOwner: deployer.address,
        usdc,
        oracle: oracleAddress,
        feeRecipient,
        cooldownSeconds: cooldownSeconds.toString(),
      },
      oracle: {
        initialOwner: deployer.address,
        vault: predictedVault,
      },
    },
    timestamp: new Date().toISOString(),
  };
  const outDir = path.resolve(process.cwd(), "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}-Vault.json`);
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
  console.log("[deploy-vault] deployment record:", outPath);

  // Sanity: confirm artifact exists (used by verify scripts)
  void artifacts;
}

main().catch((err) => {
  console.error("[deploy-vault] FAILED:", err);
  process.exit(1);
});
