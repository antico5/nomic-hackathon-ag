import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@ignored/hardhat-ignition";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
    },
  },
};

export default config;
