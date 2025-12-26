import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { XNS } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("XNS", function () {
  // Types
  interface SetupOutput {
    xns: XNS;
    owner: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
    deploymentBlockTimestamp: number;
    deploymentReceipt: any;
  }

  // Test setup function
  async function setup(): Promise<SetupOutput> {
    const [owner, user1, user2] = await ethers.getSigners();

    const xns = await ethers.deployContract("XNS", [owner.address]);
    const deploymentTx = xns.deploymentTransaction();
    await xns.waitForDeployment();
    const deploymentReceipt = await deploymentTx!.wait();
    const deploymentBlock = await ethers.provider.getBlock(deploymentReceipt!.blockNumber);

    return {
      xns,
      owner,
      user1,
      user2,
      deploymentBlockTimestamp: deploymentBlock!.timestamp,
      deploymentReceipt: deploymentReceipt!,
    };
  }

  describe("Contract initialization", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should initialize the contract correctly", async () => {
        // Should initialize owner correctly
        expect(await s.xns.OWNER()).to.equal(s.owner.address);

        // Should set `deployedAt` to current block timestamp
        expect(await s.xns.DEPLOYED_AT()).to.equal(s.deploymentBlockTimestamp);

        // Retrieve namespace info for "x" namespace
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [pricePerName, creator] = await getNamespaceInfoByString("x");

        // Should register special namespace "x" with correct price (100 ETH)
        expect(pricePerName).to.equal(ethers.parseEther("100"));

        // Should set special namespace creator to owner
        expect(creator).to.equal(s.owner.address);

        // Should map SPECIAL_NAMESPACE_PRICE to "x" namespace
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [namespace] = await getNamespaceInfoByPrice(ethers.parseEther("100"));
        expect(namespace).to.equal("x");
    });

    it("Should have correct constants", async () => {
        // Should have correct NAMESPACE_REGISTRATION_FEE (200 ether)
        expect(await s.xns.NAMESPACE_REGISTRATION_FEE()).to.equal(ethers.parseEther("200"));

        // Should have correct NAMESPACE_CREATOR_EXCLUSIVE_PERIOD (30 days)
        expect(await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD()).to.equal(30 * 24 * 60 * 60);

        // Should have correct INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD (1 year)
        expect(await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD()).to.equal(365 * 24 * 60 * 60);

        // Should have correct PRICE_STEP (0.001 ether / 1e15)
        expect(await s.xns.PRICE_STEP()).to.equal(ethers.parseEther("0.001"));

        // Should have correct SPECIAL_NAMESPACE ("x")
        expect(await s.xns.SPECIAL_NAMESPACE()).to.equal("x");

        // Should have correct SPECIAL_NAMESPACE_PRICE (100 ether)
        expect(await s.xns.SPECIAL_NAMESPACE_PRICE()).to.equal(ethers.parseEther("100"));

        // Should have correct DETH address
        expect(await s.xns.DETH()).to.equal("0xE46861C9f28c46F27949fb471986d59B256500a7");
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `NamespaceRegistered` event for special namespace", async () => {
        await expect(s.xns.deploymentTransaction())
            .to.emit(s.xns, "NamespaceRegistered")
            .withArgs("x", ethers.parseEther("100"), s.owner.address);
    });

    
  });

  describe("isValidLabel", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return `true` for valid labels with lowercase letters", async () => {
        expect(await s.xns.isValidLabel("alice")).to.be.true;
        expect(await s.xns.isValidLabel("bob")).to.be.true;
        expect(await s.xns.isValidLabel("charlie")).to.be.true;
    });

    it("Should return `true` for valid labels with digits", async () => {
        expect(await s.xns.isValidLabel("123")).to.be.true;
        expect(await s.xns.isValidLabel("0")).to.be.true;
        expect(await s.xns.isValidLabel("999")).to.be.true;
    });

    it("Should return `true` for valid labels with hyphens", async () => {
        expect(await s.xns.isValidLabel("alice-bob")).to.be.true;
        expect(await s.xns.isValidLabel("test-label")).to.be.true;
        expect(await s.xns.isValidLabel("my-name")).to.be.true;
    });

    it("Should return `true` for valid labels combining letters, digits, and hyphens", async () => {
        expect(await s.xns.isValidLabel("alice123")).to.be.true;
        expect(await s.xns.isValidLabel("test-123")).to.be.true;
        expect(await s.xns.isValidLabel("user-42-name")).to.be.true;
        expect(await s.xns.isValidLabel("abc-123-def")).to.be.true;
    });

    it("Should return `true` for minimum length (1 character)", async () => {
        expect(await s.xns.isValidLabel("a")).to.be.true;
        expect(await s.xns.isValidLabel("1")).to.be.true;
        expect(await s.xns.isValidLabel("x")).to.be.true;
    });

    it("Should return `true` for maximum length (20 characters)", async () => {
        expect(await s.xns.isValidLabel("a".repeat(20))).to.be.true;
        expect(await s.xns.isValidLabel("1".repeat(20))).to.be.true;
        expect(await s.xns.isValidLabel("abcdefghijklmnopqrst")).to.be.true;
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should return `false` for empty string", async () => {
        expect(await s.xns.isValidLabel("")).to.be.false;
    });

    it("Should return `false` for labels longer than 20 characters", async () => {
        expect(await s.xns.isValidLabel("a".repeat(21))).to.be.false;
        expect(await s.xns.isValidLabel("abcdefghijklmnopqrstu")).to.be.false;
        expect(await s.xns.isValidLabel("verylonglabelname12345")).to.be.false;
    });

    it("Should return `false` for labels starting with hyphen", async () => {
        expect(await s.xns.isValidLabel("-alice")).to.be.false;
        expect(await s.xns.isValidLabel("-test")).to.be.false;
        expect(await s.xns.isValidLabel("-123")).to.be.false;
    });

    it("Should return `false` for labels ending with hyphen", async () => {
        expect(await s.xns.isValidLabel("alice-")).to.be.false;
        expect(await s.xns.isValidLabel("test-")).to.be.false;
        expect(await s.xns.isValidLabel("123-")).to.be.false;
    });

    it("Should return `false` for labels containing uppercase letters", async () => {
        expect(await s.xns.isValidLabel("Alice")).to.be.false;
        expect(await s.xns.isValidLabel("TEST")).to.be.false;
        expect(await s.xns.isValidLabel("aliceBob")).to.be.false;
        expect(await s.xns.isValidLabel("test-Label")).to.be.false;
    });

    it("Should return `false` for labels containing spaces", async () => {
        expect(await s.xns.isValidLabel("alice bob")).to.be.false;
        expect(await s.xns.isValidLabel("test label")).to.be.false;
        expect(await s.xns.isValidLabel(" alice")).to.be.false;
        expect(await s.xns.isValidLabel("alice ")).to.be.false;
    });

    it("Should return `false` for labels containing special characters (except hyphen)", async () => {
        expect(await s.xns.isValidLabel("alice@bob")).to.be.false;
        expect(await s.xns.isValidLabel("test#label")).to.be.false;
        expect(await s.xns.isValidLabel("user$name")).to.be.false;
        expect(await s.xns.isValidLabel("test.label")).to.be.false;
        expect(await s.xns.isValidLabel("alice!bob")).to.be.false;
    });

    it("Should return `false` for labels containing underscores", async () => {
        expect(await s.xns.isValidLabel("alice_bob")).to.be.false;
        expect(await s.xns.isValidLabel("test_label")).to.be.false;
        expect(await s.xns.isValidLabel("user_name_123")).to.be.false;
    });

    it("Should return `false` for labels containing consecutive hyphens", async () => {
        expect(await s.xns.isValidLabel("alice--bob")).to.be.false;
        expect(await s.xns.isValidLabel("test--label")).to.be.false;
        expect(await s.xns.isValidLabel("my---name")).to.be.false;
        expect(await s.xns.isValidLabel("a--b")).to.be.false;
    });

    
  });
});

