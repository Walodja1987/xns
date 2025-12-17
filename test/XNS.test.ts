import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { DETH } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("DETH", function () {
  // Types
  interface SetupOutput {
    deth: DETH;
    owner: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
  }

  // Test setup function
  async function setup(): Promise<SetupOutput> {
    const [owner, user1, user2] = await ethers.getSigners();

    const deth = await ethers.deployContract("DETH");
    await deth.waitForDeployment();

    return {
      deth,
      owner,
      user1,
      user2,
    };
  }

  describe("Burning ETH", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    describe("burn()", function () {
      it("Should credit DETH to recipient when burning ETH", async () => {
        const burnAmount = ethers.parseEther("1.0");
        await s.deth.burn(s.user1.address, { value: burnAmount });

        expect(await s.deth.burned(s.user1.address)).to.equal(burnAmount);
      });

      it("Should update totalBurned", async () => {
        const burnAmount = ethers.parseEther("1.0");
        await s.deth.burn(s.user1.address, { value: burnAmount });

        expect(await s.deth.totalBurned()).to.equal(burnAmount);
      });

      it("Should allow burning 0 ETH", async () => {
        await expect(s.deth.burn(s.user1.address, { value: 0 }))
          .to.not.be.reverted;
      });

      it("Should allow multiple burns to same recipient", async () => {
        const burn1 = ethers.parseEther("1.0");
        const burn2 = ethers.parseEther("2.0");
        
        await s.deth.burn(s.user1.address, { value: burn1 });
        await s.deth.burn(s.user1.address, { value: burn2 });

        expect(await s.deth.burned(s.user1.address)).to.equal(burn1 + burn2);
        expect(await s.deth.totalBurned()).to.equal(burn1 + burn2);
      });

      it("Should emit ETHBurned event", async () => {
        const burnAmount = ethers.parseEther("1.0");
        await expect(s.deth.burn(s.user1.address, { value: burnAmount }))
          .to.emit(s.deth, "ETHBurned")
          .withArgs(s.owner.address, s.user1.address, burnAmount);
      });
    });

    describe("Direct ETH transfers", function () {
      it("Should credit DETH to sender on direct ETH transfer", async () => {
        const burnAmount = ethers.parseEther("1.0");
        await s.user1.sendTransaction({
          to: await s.deth.target,
          value: burnAmount,
        });

        expect(await s.deth.burned(s.user1.address)).to.equal(burnAmount);
      });

      it("Should allow 0 ETH direct transfer", async () => {
        await expect(
          s.user1.sendTransaction({
            to: await s.deth.target,
            value: 0,
          })
        ).to.not.be.reverted;
      });

      it("Should emit ETHBurned event on direct transfer", async () => {
        const burnAmount = ethers.parseEther("1.0");
        await expect(
          s.user1.sendTransaction({
            to: await s.deth.target,
            value: burnAmount,
          })
        )
          .to.emit(s.deth, "ETHBurned")
          .withArgs(s.user1.address, s.user1.address, burnAmount);
      });

      it("Should not allow sending ETH with data", async () => {
        await expect(
          s.user1.sendTransaction({
            to: await s.deth.target,
            value: 0,
            data: ethers.randomBytes(32),
          })
        ).to.be.reverted;
      });
    });
  });

  describe("View functions", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    describe("burned()", function () {
      it("Should return 0 for address with no burns", async () => {
        expect(await s.deth.burned(s.user1.address)).to.equal(0);
      });

      it("Should track burns separately for different addresses", async () => {
        const burn1 = ethers.parseEther("1.0");
        const burn2 = ethers.parseEther("2.0");

        await s.deth.burn(s.user1.address, { value: burn1 });
        await s.deth.burn(s.user2.address, { value: burn2 });

        expect(await s.deth.burned(s.user1.address)).to.equal(burn1);
        expect(await s.deth.burned(s.user2.address)).to.equal(burn2);
      });
    });

    describe("totalBurned()", function () {
      it("Should return 0 initially", async () => {
        expect(await s.deth.totalBurned()).to.equal(0);
      });

      it("Should track total burns across all users", async () => {
        const burn1 = ethers.parseEther("1.0");
        const burn2 = ethers.parseEther("2.0");

        await s.deth.burn(s.user1.address, { value: burn1 });
        await s.deth.burn(s.user2.address, { value: burn2 });

        expect(await s.deth.totalBurned()).to.equal(burn1 + burn2);
      });

      it("Should include both direct transfers and burns", async () => {
        const burn1 = ethers.parseEther("1.0");
        const burn2 = ethers.parseEther("2.0");

        await s.deth.burn(s.user1.address, { value: burn1 });
        await s.user2.sendTransaction({
          to: await s.deth.target,
          value: burn2,
        });

        expect(await s.deth.totalBurned()).to.equal(burn1 + burn2);
      });
    });
  });
});
