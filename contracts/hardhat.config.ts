import * as dotenv from "dotenv";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

dotenv.config();

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    base: {
      type: "http",
      url: process.env.BASE_RPC_URL || (() => { throw new Error("BASE_RPC_URL is not defined in the .env file"); })(),
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : (() => { throw new Error("PRIVATE_KEY is not defined in the .env file"); })(),
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || (() => { throw new Error("SEPOLIA_RPC_URL is not defined in the .env file"); })(),
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : (() => { throw new Error("PRIVATE_KEY is not defined in the .env file"); })(),
    },
  },
});
