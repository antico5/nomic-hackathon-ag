import { expect, AssertionError } from "chai";
import { ethers } from "hardhat";
import { smock } from "@defi-wonderland/smock";

const ETHER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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
  });

  describe("distributeEther", function () {
    it("is only callable when the wallet is dead", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", 1);

      await expect(contract.connect(heir1).distributeEther()).to.revertedWith(
        "wallet is not dead"
      );

      await contract.setVariable("status", 2);

      await expect(contract.connect(heir1).distributeEther()).to.revertedWith(
        "wallet is not dead"
      );

      await contract.setVariable("status", 3);

      await contract.connect(heir1).distributeEther();
    });

    it("is only callable by heirs", async () => {
      const { owner, contract, heir1 } = await setup();
      await contract.setVariable("status", 3);

      await expect(contract.connect(owner).distributeEther()).to.revertedWith(
        "caller is not heir"
      );

      await contract.connect(heir1).distributeEther();
    });

    it("cant be called if the user already withdrew eth", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", 3);

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
      await contract.setVariable("status", 3);

      expect(await contract.originalAssetBalance(ETHER)).to.eq(0);
      await contract.connect(heir1).distributeEther();
      expect(await contract.originalAssetBalance(ETHER)).to.eq(1337);
    });

    it("doesnt load the ether balance if it was initialized already", async () => {
      const { contract, heir1 } = await setup();
      await heir1.sendTransaction({ to: contract.address, value: 1337 });
      await contract.setVariable("status", 3);
      await contract.setVariable("originalAssetBalance", { [ETHER]: 123 });

      expect(await contract.originalAssetBalance(ETHER)).to.eq(123);
      await contract.connect(heir1).distributeEther();
      expect(await contract.originalAssetBalance(ETHER)).to.eq(123);
    });

    it("marks that the heir withdrew ether", async () => {
      const { contract, heir1 } = await setup();
      await contract.setVariable("status", 3);

      expect(await contract.heirsWithdrawn(heir1.address, ETHER)).to.eq(false);
      await contract.connect(heir1).distributeEther();
      expect(await contract.heirsWithdrawn(heir1.address, ETHER)).to.eq(true);
    });

    it("sends the fraction of ether that belongs to the calling heir", async () => {
      const { contract, heir1, owner } = await setup();
      await contract.setVariable("status", 3);

      await owner.sendTransaction({ to: contract.address, value: 90 });

      await expect(
        contract.connect(heir1).distributeEther()
      ).to.changeEtherBalance(heir1, 30);
    });
  });

  describe("distributeToken", function () {
    it("is only callable when the wallet is dead", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", 1);

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.revertedWith("wallet is not dead");

      await contract.setVariable("status", 2);

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.revertedWith("wallet is not dead");

      await contract.setVariable("status", 3);

      await contract.connect(heir1).distributeToken(token.address);
    });

    it("is only callable by heirs", async () => {
      const { owner, contract, heir1, token } = await setup();
      await contract.setVariable("status", 3);

      await expect(
        contract.connect(owner).distributeToken(token.address)
      ).to.revertedWith("caller is not heir");

      await contract.connect(heir1).distributeToken(token.address);
    });

    it("cant be called if the user already withdrew the token", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", 3);

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
      await contract.setVariable("status", 3);

      expect(await contract.originalAssetBalance(token.address)).to.eq(0);
      await contract.connect(heir1).distributeToken(token.address);
      expect(await contract.originalAssetBalance(token.address)).to.eq(1337);
    });

    it("doesnt load the token balance if it was initialized already", async () => {
      const { contract, heir1, token } = await setup();
      await token.mint(contract.address, 1337);

      await contract.setVariable("status", 3);
      await contract.setVariable("originalAssetBalance", {
        [token.address]: 123,
      });

      expect(await contract.originalAssetBalance(token.address)).to.eq(123);
      await contract.connect(heir1).distributeToken(token.address);
      expect(await contract.originalAssetBalance(token.address)).to.eq(123);
    });

    it("marks that the heir withdrew the token", async () => {
      const { contract, heir1, token } = await setup();
      await contract.setVariable("status", 3);

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
      await contract.setVariable("status", 3);

      await token.mint(contract.address, 90);

      await expect(
        contract.connect(heir1).distributeToken(token.address)
      ).to.changeTokenBalance(token, heir1.address, 30);
    });
  });

  describe("addHeir", function () {
    it("should add the heir", async () => {
      const { heir1, contract } = await setup();
      await contract.addHeir(heir1.address);
      expect((await contract.heirs(heir1.address)) === true);
      expect((await contract.heirCount()).eq(1));
    });

    it("should revert if a non-owner tries to add themselves as an heir", async () => {
      const { heir1, contract } = await setup();
      await expect(
        contract.connect(heir1).addHeir(heir1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      expect((await contract.heirs(heir1.address)) === false);
      expect((await contract.heirCount()).eq(1));
    });
  });

  describe("removeHeir", function () {
    async function setupHeir() {
      const { heir1, contract } = await setup();
      await contract.addHeir(heir1.address);
      expect((await contract.heirs(heir1.address)) === true);
      expect((await contract.heirCount()).eq(1));
      return { heir1, contract };
    }

    it("should remove the heir", async () => {
      const { heir1, contract } = await setupHeir();
      await contract.removeHeir(heir1.address);
      expect((await contract.heirs(heir1.address)) === false);
      expect((await contract.heirCount()).eq(0));
    });

    it("should revert if a non-owner tries to remove themselves as an heir", async () => {
      const { heir1, contract } = await setupHeir();
      await expect(
        contract.connect(heir1).removeHeir(heir1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("initiateClaim", function () {
    it("should allow initiation of a claim", () => {});
    it("should revert if called by the owner", () => {});
    it("should revert if called by a non-participant", () => {});
    it("should revert if the wallet status is DEATH_CLAIMED", () => {});
    it("should revert if the wallet status is DEAD", () => {});
    it("should revert if the owner has invoked call() too recently", () => {});
  });

  describe("finalizeClaim", function () {
    it("should allow finalization of a claim", () => {});
    it("should revert if called by the owner", () => {});
    it("should revert if called by a non-participant", () => {});
    it("should revert if the wallet status is ALIVE", () => {});
    it("should revert if the wallet status is DEAD", () => {});
    it("should revert if the claim has been vetoed", () => {});
  });

  describe("vetoClaim", function () {
    it("should allow the owner to veto a claim", () => {});
    it("should allow a second heir to veto a claim", () => {});
    it("should revert if the wallet status is ALIVE", () => {});
    it("should revert if the wallet status is DEAD", () => {});
  });
});
