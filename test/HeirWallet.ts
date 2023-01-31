import { expect } from "chai";
import { ethers } from "hardhat";
import { smock } from "@defi-wonderland/smock";

const ETHER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ALIVE = BigInt(1);
const DEATH_CLAIMED = BigInt(2);
const DEAD = BigInt(3);

describe("HeirWallet", function () {
  async function setup() {
    // Contracts are deployed using the first signer/account by default
    const [owner, heir1, heir2, heir3, randomUser] = await ethers.getSigners();

    const inactivityThreshold = 2 * 30 * 24 * 60 * 60; // 2 months

    const vetoThreshold = 1 * 30 * 24 * 60 * 60; // 1 month

    const contractFactory = await smock.mock("HeirWallet");
    const contract = await contractFactory.deploy(
      inactivityThreshold,
      vetoThreshold
    );

    expect(await contract.status()).to.equal(ALIVE);

    const mockCallableFactory = await ethers.getContractFactory(
      "MockCallableContract"
    );
    const mockCallableContract = await mockCallableFactory.deploy();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const token = await tokenFactory.deploy();

    const provider = ethers.provider;

    await contract.addHeir(heir1.address);
    await contract.addHeir(heir2.address);
    await contract.addHeir(heir3.address);

    return {
      owner,
      heir1,
      heir2,
      heir3,
      randomUser,
      contract,
      contractFactory,
      mockCallableContract,
      provider,
      token,
    };
  }

  describe("owner", function () {
    it("is the deployer", async () => {
      const { owner, contract } = await setup();

      expect(await contract.owner()).to.equal(owner.address);
    });
  });

  describe("constructor", function () {
    it("sets thresholds", async () => {
      const { contractFactory } = await setup();
      const contract = await contractFactory.deploy(1, 2);

      expect(await contract.inactivityThreshold()).to.eq(1);
      expect(await contract.vetoThreshold()).to.eq(2);
    });
  });

  describe("call", function () {
    it("is only callable by the owner", async () => {
      const { randomUser, contract, mockCallableContract } = await setup();
      await expect(
        contract
          .connect(randomUser)
          .call(mockCallableContract.address, 0, "0x00")
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("calls the given contract with passed data and value", async () => {
      const { owner, provider, contract, mockCallableContract } = await setup();

      await owner.sendTransaction({
        to: contract.address,
        value: 99,
      });

      await contract.call(mockCallableContract.address, 99, "0x12");

      expect(await mockCallableContract.lastData()).to.eq("0x12");
      expect(await mockCallableContract.lastValue()).to.eq(99);
      expect(await provider.getBalance(mockCallableContract.address)).to.eq(99);
    });

    it("updates the lastOwnerCall variable to block timestamp", async () => {
      const { provider, contract, mockCallableContract } = await setup();

      const recpt = await contract.call(mockCallableContract.address, 0, "0x");
      const block = await provider.getBlock(recpt.blockHash);
      const timestamp = block.timestamp;

      expect(await contract.lastOwnerCall()).to.eq(timestamp);
    });
  });

  describe("distributeEther", function () {
    it("is only callable when the wallet is dead", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", ALIVE);

      await expect(contract.connect(heir1).distributeEther()).to.revertedWith(
        "wallet is not dead"
      );

      await contract.setVariable("status", DEATH_CLAIMED);

      await expect(contract.connect(heir1).distributeEther()).to.revertedWith(
        "wallet is not dead"
      );

      await contract.setVariable("status", DEAD);

      await contract.connect(heir1).distributeEther();
    });

    it("is only callable by heirs", async () => {
      const { owner, contract, heir1 } = await setup();
      await contract.setVariable("status", DEAD);

      await expect(contract.connect(owner).distributeEther()).to.revertedWith(
        "caller is not heir"
      );

      await contract.connect(heir1).distributeEther();
    });

    it("cant be called if the user already withdrew eth", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", DEAD);

      await contract.setVariable("heirsWithdrawn", {
        [heir1.address]: {
          [ETHER]: true,
        },
      });

      await expect(contract.connect(heir1).distributeEther()).to.revertedWith(
        "you already withdrew eth"
      );

      await contract.setVariable("heirsWithdrawn", {
        [heir1.address]: {
          [ETHER]: false,
        },
      });

      await contract.connect(heir1).distributeEther();
    });

    it("loads the ether balance if it wasn't initialized already", async () => {
      const { contract, heir1 } = await setup();
      await heir1.sendTransaction({ to: contract.address, value: 1337 });
      await contract.setVariable("status", DEAD);

      expect(await contract.originalAssetBalance(ETHER)).to.eq(0);
      await contract.connect(heir1).distributeEther();
      expect(await contract.originalAssetBalance(ETHER)).to.eq(1337);
    });

    it("doesnt load the ether balance if it was initialized already", async () => {
      const { contract, heir1 } = await setup();
      await heir1.sendTransaction({ to: contract.address, value: 1337 });
      await contract.setVariable("status", DEAD);
      await contract.setVariable("originalAssetBalance", { [ETHER]: 123 });

      expect(await contract.originalAssetBalance(ETHER)).to.eq(123);
      await contract.connect(heir1).distributeEther();
      expect(await contract.originalAssetBalance(ETHER)).to.eq(123);
    });

    it("marks that the heir withdrew ether", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", DEAD);

      expect(await contract.heirsWithdrawn(heir1.address, ETHER)).to.eq(false);
      await contract.connect(heir1).distributeEther();
      expect(await contract.heirsWithdrawn(heir1.address, ETHER)).to.eq(true);
    });

    it("sends the fraction of ether that belongs to the calling heir", async () => {
      const { contract, heir1, owner } = await setup();
      await contract.setVariable("status", DEAD);

      await owner.sendTransaction({ to: contract.address, value: 90 });

      await expect(
        contract.connect(heir1).distributeEther()
      ).to.changeEtherBalance(heir1, 30);
    });
  });

  describe("distributeToken", function () {
    it("is only callable when the wallet is dead", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", ALIVE);

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.revertedWith("wallet is not dead");

      await contract.setVariable("status", DEATH_CLAIMED);

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.revertedWith("wallet is not dead");

      await contract.setVariable("status", DEAD);

      await contract.connect(heir1).distributeToken(token.address);
    });

    it("is only callable by heirs", async () => {
      const { owner, contract, heir1, token } = await setup();
      await contract.setVariable("status", DEAD);

      await expect(
        contract.connect(owner).distributeToken(token.address)
      ).to.revertedWith("caller is not heir");

      await contract.connect(heir1).distributeToken(token.address);
    });

    it("cant be called if the user already withdrew the token", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", DEAD);

      await contract.setVariable("heirsWithdrawn", {
        [heir1.address]: {
          [token.address]: true,
        },
      });

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.revertedWith("you already withdrew this token");

      await contract.setVariable("heirsWithdrawn", {
        [heir1.address]: {
          [token.address]: false,
        },
      });

      await contract.connect(heir1).distributeToken(token.address);
    });

    it("loads the token balance if it wasn't initialized already", async () => {
      const { contract, heir1, token } = await setup();
      await token.mint(contract.address, 1337);
      await contract.setVariable("status", DEAD);

      expect(await contract.originalAssetBalance(token.address)).to.eq(0);
      await contract.connect(heir1).distributeToken(token.address);
      expect(await contract.originalAssetBalance(token.address)).to.eq(1337);
    });

    it("doesnt load the token balance if it was initialized already", async () => {
      const { contract, heir1, token } = await setup();
      await token.mint(contract.address, 1337);

      await contract.setVariable("status", DEAD);
      await contract.setVariable("originalAssetBalance", {
        [token.address]: 123,
      });

      expect(await contract.originalAssetBalance(token.address)).to.eq(123);
      await contract.connect(heir1).distributeToken(token.address);
      expect(await contract.originalAssetBalance(token.address)).to.eq(123);
    });

    it("marks that the heir withdrew the token", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", DEAD);

      expect(await contract.heirsWithdrawn(heir1.address, token.address)).to.eq(
        false
      );
      await contract.connect(heir1).distributeToken(token.address);
      expect(await contract.heirsWithdrawn(heir1.address, token.address)).to.eq(
        true
      );
    });

    it("sends the fraction of token that belongs to the calling heir", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", DEAD);

      await token.mint(contract.address, 90);

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.changeTokenBalance(token, heir1.address, 30);
    });
  });

  describe("addHeir", function () {
    it("should add the heir", async () => {
      const { randomUser, contract } = await setup();
      await contract.addHeir(randomUser.address);
      expect((await contract.heirs(randomUser.address)) === true);
      expect(await contract.heirCount()).to.eq(4);
    });

    it("should revert if a non-owner tries to add themselves as an heir", async () => {
      const { heir1, contract } = await setup();
      await expect(
        contract.connect(heir1).addHeir(heir1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      expect((await contract.heirs(heir1.address)) === false);
      expect(await contract.heirCount()).eq(3);
    });

    it("should revert if the heir has already been added", async () => {
      const { heir1, contract } = await setup();
      await expect(contract.addHeir(heir1.address)).to.be.revertedWith("already an heir");
      expect(await contract.heirs(heir1.address)).to.eq(true);
      expect(await contract.heirCount()).eq(3);
    });
  });

  describe("removeHeir", function () {
    it("should remove the heir", async () => {
      const { heir1, contract } = await setup();
      await contract.removeHeir(heir1.address);
      expect((await contract.heirs(heir1.address)) === false);
      expect((await contract.heirCount()).eq(0));
    });

    it("should revert if a non-owner tries to remove themselves as an heir", async () => {
      const { heir1, contract } = await setup();
      await expect(
        contract.connect(heir1).removeHeir(heir1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if the given address is not an heir", async () => {
      const { contract, randomUser } = await setup();
      await expect(
        contract.removeHeir(randomUser.address)
      ).to.be.revertedWith("not an heir");
    });
  });

  describe("initiateClaim", function () {
    it("should allow initiation of a claim", async () => {
      const { heir1, contract, provider } = await setup();
      const receipt = await contract.connect(heir1).initiateClaim();
      expect(await contract.status()).to.eq(DEATH_CLAIMED);

      const block = await provider.getBlock(receipt.blockHash);
      const timestamp = block.timestamp;
      expect(await contract.claimStarted()).to.eq(timestamp);
    });

    it("should revert if called by the owner", async () => {
      const { contract } = await setup();
      await expect(contract.initiateClaim())
        .to.be.revertedWith("caller is not heir");
      expect(await contract.status()).to.equal(ALIVE);
    });

    it("should revert if called by a non-participant", async () => {
      const { contract, randomUser } = await setup();
      await expect(contract.connect(randomUser).initiateClaim())
        .to.be.revertedWith("caller is not heir");
      expect(await contract.status()).to.equal(ALIVE);
      expect(await contract.claimStarted()).to.eq(0);
    });

    it("should revert if the wallet status is DEATH_CLAIMED", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", DEATH_CLAIMED);
      await expect(contract.connect(heir1).initiateClaim())
        .to.be.revertedWith("wallet is not alive");
      expect(await contract.status()).to.equal(DEATH_CLAIMED);
      expect(await contract.claimStarted()).to.eq(0);
    });

    it("should revert if the wallet status is DEAD", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", DEAD);
      await expect(contract.connect(heir1).initiateClaim())
        .to.be.revertedWith("wallet is not alive");
      expect(await contract.claimStarted()).to.eq(0);
    });

    it("should revert if the owner has invoked call() too recently", async () => {
      const { contract, owner, heir1, mockCallableContract } = await setup();

      await owner.sendTransaction({
        to: contract.address,
        value: 99,
      });

      await contract.call(mockCallableContract.address, 99, "0x12");

      await expect(contract.connect(heir1).initiateClaim()).to.be.revertedWith("owner has invoked call() too recently");

      expect(await contract.status()).to.eq(ALIVE);
      expect(await contract.claimStarted()).to.eq(0);
    });
  });

  describe("finalizeClaim", function () {
    it("should allow finalization of a claim", async () => {
    });

    it("should revert if called by the owner", async () => {
    });

    it("should revert if called by a non-participant", async () => {
    });

    it("should revert if the wallet status is ALIVE", async () => {
    });

    it("should revert if the wallet status is DEAD", async () => {
    });

    it("should revert if the claim has been vetoed", async () => {
    });
  });

  describe("vetoClaim", function () {
    it("should allow the owner to veto a claim", async () => {
    });

    it("should allow a second heir to veto a claim", async () => {
    });

    it("should revert if the wallet status is ALIVE", async () => {
    });

    it("should revert if the wallet status is DEAD", async () => {
    });
  });
});
