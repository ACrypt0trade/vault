import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

/**
 * Hardhat configuration for Custom Vault on HyperEVM testnet.
 *
 * Notes:
 * - Solidity 0.8.28 with evmVersion "cancun" is required because HyperEVM
 *   is documented as "Cancun hardfork without blobs". Newer Solidity
 *   defaults (e.g., "prague") would emit opcodes that fail on-chain.
 * - chainId 998 is HyperEVM testnet. Public RPC is rate-limited to
 *   100 req/min per IP. WebSocket is NOT supported on the public RPC.
 * - Big-block deployment (30M gas, ~1 min block time) is required for
 *   contract deployments that exceed the 2M small-block limit. Use the
 *   `bigBlockGasPrice` RPC method for big-block transactions.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    hyperEvmTestnet: {
      url: "https://rpc.hyperliquid-testnet.xyz/evm",
      chainId: 998,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  // Per D-09: contract verification is done through Sourcify (testnet.purrsec.com
  // uses Sourcify, not Etherscan). `hardhat-verify` ships with first-class
  // Sourcify support; we only need to enable it and point at the default server.
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  // Disable Etherscan verification path explicitly so `hardhat verify` does
  // not attempt to call a non-existent Etherscan API for chain 998.
  etherscan: {
    enabled: false,
  },
};

export default config;
