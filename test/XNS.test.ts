import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
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

    // Deploy DETH contract at the required address
    const DETH_ADDRESS = "0xE46861C9f28c46F27949fb471986d59B256500a7";
    const deth = await ethers.deployContract("DETH");
    await deth.waitForDeployment();
    
    // Use hardhat_setCode to set the DETH contract code at the required address
    const dethBytecode = await ethers.provider.getCode(deth.target);
    await ethers.provider.send("hardhat_setCode", [DETH_ADDRESS, dethBytecode!]);

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

  describe("isValidNamespace", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return `true` for valid namespaces with lowercase letters", async () => {
        expect(await s.xns.isValidNamespace("a")).to.be.true;
        expect(await s.xns.isValidNamespace("ab")).to.be.true;
        expect(await s.xns.isValidNamespace("abc")).to.be.true;
        expect(await s.xns.isValidNamespace("defi")).to.be.true;
    });

    it("Should return `true` for valid namespaces with digits", async () => {
        expect(await s.xns.isValidNamespace("0")).to.be.true;
        expect(await s.xns.isValidNamespace("1")).to.be.true;
        expect(await s.xns.isValidNamespace("001")).to.be.true;
        expect(await s.xns.isValidNamespace("1234")).to.be.true;
    });

    it("Should return `true` for valid namespaces combining letters and digits", async () => {
        expect(await s.xns.isValidNamespace("a1")).to.be.true;
        expect(await s.xns.isValidNamespace("1a")).to.be.true;
        expect(await s.xns.isValidNamespace("ab1")).to.be.true;
        expect(await s.xns.isValidNamespace("1ab2")).to.be.true;
    });

    it("Should return `true` for minimum length (1 character)", async () => {
        expect(await s.xns.isValidNamespace("a")).to.be.true;
        expect(await s.xns.isValidNamespace("1")).to.be.true;
        expect(await s.xns.isValidNamespace("x")).to.be.true;
    });

    it("Should return `true` for maximum length (4 characters)", async () => {
        expect(await s.xns.isValidNamespace("abcd")).to.be.true;
        expect(await s.xns.isValidNamespace("1234")).to.be.true;
        expect(await s.xns.isValidNamespace("a1b2")).to.be.true;
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should return `false` for empty string", async () => {
        expect(await s.xns.isValidNamespace("")).to.be.false;
    });

    it("Should return `false` for namespaces longer than 4 characters", async () => {
        expect(await s.xns.isValidNamespace("abcde")).to.be.false;
        expect(await s.xns.isValidNamespace("12345")).to.be.false;
        expect(await s.xns.isValidNamespace("verylong")).to.be.false;
    });

    it("Should return `false` for namespaces containing uppercase letters", async () => {
        expect(await s.xns.isValidNamespace("A")).to.be.false;
        expect(await s.xns.isValidNamespace("ABC")).to.be.false;
        expect(await s.xns.isValidNamespace("aBc")).to.be.false;
        expect(await s.xns.isValidNamespace("defI")).to.be.false;
    });

    it("Should return `false` for namespaces containing hyphens", async () => {
        expect(await s.xns.isValidNamespace("a-b")).to.be.false;
        expect(await s.xns.isValidNamespace("test-1")).to.be.false;
        expect(await s.xns.isValidNamespace("-ab")).to.be.false;
        expect(await s.xns.isValidNamespace("ab-")).to.be.false;
    });

    it("Should return `false` for namespaces containing spaces", async () => {
        expect(await s.xns.isValidNamespace("a b")).to.be.false;
        expect(await s.xns.isValidNamespace("test 1")).to.be.false;
        expect(await s.xns.isValidNamespace(" ab")).to.be.false;
        expect(await s.xns.isValidNamespace("ab ")).to.be.false;
    });

    it("Should return `false` for namespaces containing special characters", async () => {
        expect(await s.xns.isValidNamespace("a@b")).to.be.false;
        expect(await s.xns.isValidNamespace("test#1")).to.be.false;
        expect(await s.xns.isValidNamespace("user$name")).to.be.false;
        expect(await s.xns.isValidNamespace("test.label")).to.be.false;
        expect(await s.xns.isValidNamespace("a!b")).to.be.false;
        expect(await s.xns.isValidNamespace("a_b")).to.be.false;
    });

    
  });

  describe("registerNamespace", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should register a new namespace correctly", async () => {
        // ---------
        // Arrange: Prepare parameters for namespace registration
        // ---------
        const namespace = "yolo";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act: Register namespace with user1 (not owner as they can register namespaces for free in the first year)
        // ---------
        const tx = await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace info by namespace string
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        // Should create namespace with correct price
        expect(returnedPrice).to.equal(pricePerName);

        // Should set namespace creator to `msg.sender` (user1 in this case)
        expect(creator).to.equal(s.user1.address);

        // Should set createdAt timestamp
        expect(returnedCreatedAt).to.equal(createdAt);

        // Retrieve namespace info by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace, returnedPriceByPrice, creatorByPrice, createdAtByPrice] = await getNamespaceInfoByPrice(pricePerName);

        // Should map price to namespace
        expect(returnedNamespace).to.equal(namespace);
        expect(returnedPriceByPrice).to.equal(pricePerName);
        expect(creatorByPrice).to.equal(s.user1.address);
        expect(createdAtByPrice).to.equal(createdAt);
    });

    it("Should allow owner to register namespace without fee (`msg.value = 0`) during initial period (1 year)", async () => {
        // ---------
        // Arrange: Prepare parameters for namespace registration
        // ---------
        const namespace = "ape";
        const pricePerName = ethers.parseEther("0.001");
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act: Owner registers namespace with msg.value = 0 during initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerNamespace(namespace, pricePerName, { value: 0 });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should require owner to pay fee after 1 year", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "test";
        const pricePerName = ethers.parseEther("0.002");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        
        // Fast-forward time to be after the initial period (1 year + 1 day to be safe)
        const timeToAdd = Number(initialPeriod) + 86400; // 1 year + 1 day in seconds
        await time.increase(timeToAdd);
        
        // Verify we're past the initial period
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.gt(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act: Owner registers namespace with standard fee
        // ---------
        const tx = await s.xns.connect(s.owner).registerNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);
    });
    
  });
});

