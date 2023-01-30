import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("HeirWallet", function () {
  async function setup() {
    // Contracts are deployed using the first signer/account by default
    const [owner] = await ethers.getSigners();

    const inactivityThreshold = 2 * 30 * 24 * 60 * 60; // 2 months

    const vetoThreshold = 1 * 30 * 24 * 60 * 60; // 1 month

    const contractFactory = await ethers.getContractFactory("HeirWallet");
    const contract = await contractFactory.deploy(
      inactivityThreshold,
      vetoThreshold
    );

    return {
      owner,
      contract,
    };
  }

  describe("owner", function () {
    it("is the deployer", async () => {
      const { owner, contract } = await setup();

      expect(await contract.owner()).to.equal(owner.address);
    });
  });

  describe("addHeir", function () {
  });

  describe("removeHeir", function () {
  });

  describe("initiateClaim", function () {
  });

  describe("finalizeClaim", function () {
  });

  describe("vetoClaim", function () {
  });
});
