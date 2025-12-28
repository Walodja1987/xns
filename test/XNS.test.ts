import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time, impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { XNS, DETH } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("XNS", function () {
  // Types
  interface SetupOutput {
    xns: XNS;
    owner: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
    deth: DETH; // DETH contract instance at the hardcoded address
    deploymentBlockTimestamp: number;
    deploymentReceipt: any;
  }

  // Test setup function
  async function setup(): Promise<SetupOutput> {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy DETH contract at the required address
    const DETH_ADDRESS = "0xE46861C9f28c46F27949fb471986d59B256500a7";
    const dethDeployed = await ethers.deployContract("DETH");
    await dethDeployed.waitForDeployment();
    
    // Use hardhat_setCode to set the DETH contract code at the required address
    const dethBytecode = await ethers.provider.getCode(dethDeployed.target);
    await ethers.provider.send("hardhat_setCode", [DETH_ADDRESS, dethBytecode!]);
    
    // Get the DETH contract instance at the hardcoded address
    const deth = await ethers.getContractAt("DETH", DETH_ADDRESS);

    const xns = await ethers.deployContract("XNS", [owner.address]);
    const deploymentTx = xns.deploymentTransaction();
    await xns.waitForDeployment();
    const deploymentReceipt = await deploymentTx!.wait();
    const deploymentBlock = await ethers.provider.getBlock(deploymentReceipt!.blockNumber);

    // Register "xns" namespace for testing registerName functionality
    const testNamespace = "xns";
    const testNamespacePricePerName = ethers.parseEther("0.001");
    const namespaceFee = await xns.NAMESPACE_REGISTRATION_FEE();
    await xns.connect(user1).registerNamespace(testNamespace, testNamespacePricePerName, { value: namespaceFee });

    return {
      xns,
      owner,
      user1,
      user2,
      deth,
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
        const pricePerName = ethers.parseEther("0.002");
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
        const pricePerName = ethers.parseEther("0.002");
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
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
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
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should refund all ETH to owner if owner sends ETH during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "bro";
        const pricePerName = ethers.parseEther("0.003");
        const ethToSend = ethers.parseEther("200"); // Owner sends ETH even though it's free
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // Get owner balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Owner registers namespace with ETH during initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerNamespace(namespace, pricePerName, { value: ethToSend });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get owner balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify namespace was registered and ETH was refunded
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);

        // Verify refund: balance should only decrease by gas costs (not by ethToSend)
        // balanceAfter should equal balanceBefore - gasCost (because ethToSend was refunded)
        const expectedBalanceAfter = balanceBefore - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should allow anyone (non-owner) to register namespace with fee during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "dao";
        const pricePerName = ethers.parseEther("0.004");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act: Non-owner (user1) registers namespace with fee during initial period
        // ---------
        const tx = await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(createdAt);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should allow anyone (non-owner) to register namespace with fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "nft";
        const pricePerName = ethers.parseEther("0.005");
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
        // Act: Non-owner (user1) registers namespace with fee after initial period
        // ---------
        const tx = await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(createdAt);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should refund excess payment when non-owner pays more than 200 ETH", async () => {
        // ---------
        // Arrange: Prepare parameters with excess payment
        // ---------
        const namespace = "web";
        const pricePerName = ethers.parseEther("0.006");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        const excessPayment = ethers.parseEther("50"); // Pay 50 ETH more than required
        const totalPayment = fee + excessPayment; // 250 ETH total

        // Get user1 balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Non-owner (user1) registers namespace with excess payment
        // ---------
        const tx = await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: totalPayment });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get user1 balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Assert: Verify namespace was registered and excess was refunded
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);

        // Verify refund: balance should decrease by fee (200 ETH) + gas costs (excess was refunded)
        // balanceAfter should equal balanceBefore - fee - gasCost
        const expectedBalanceAfter = balanceBefore - fee - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should refund excess payment when owner pays more than required fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time and prepare parameters with excess payment
        // ---------
        const namespace = "def";
        const pricePerName = ethers.parseEther("0.007");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        const excessPayment = ethers.parseEther("100"); // Pay 100 ETH more than required
        const totalPayment = fee + excessPayment; // 300 ETH total
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        
        // Fast-forward time to be after the initial period (1 year + 1 day to be safe)
        const timeToAdd = Number(initialPeriod) + 86400; // 1 year + 1 day in seconds
        await time.increase(timeToAdd);
        
        // Verify we're past the initial period
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.gt(Number(deployedAt) + Number(initialPeriod));

        // Get owner balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Owner registers namespace with excess payment after initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerNamespace(namespace, pricePerName, { value: totalPayment });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get owner balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify namespace was registered and excess was refunded
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);

        // Verify refund: balance should decrease by fee (200 ETH) + gas costs (excess was refunded)
        // balanceAfter should equal balanceBefore - fee - gasCost
        const expectedBalanceAfter = balanceBefore - fee - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should process the ETH payment correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid", async () => {
        // ---------
        // Arrange: Prepare parameters and get initial state
        // ---------
        const namespace = "pay";
        const pricePerName = ethers.parseEther("0.008");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        
        // Get initial state
        const initialDETHBurned = await s.deth.burned(s.user1.address);
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address);
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address);
        
        // Calculate expected amounts
        const expectedBurnAmount = (fee * 90n) / 100n; // 90% = 180 ETH
        const expectedCreatorFee = (fee * 5n) / 100n; // 5% = 10 ETH
        const expectedOwnerFee = fee - expectedBurnAmount - expectedCreatorFee; // 5% = 10 ETH

        // ---------
        // Act: Non-owner (user1) registers namespace with fee
        // ---------
        await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify payment processing
        // ---------
        // Verify namespace was registered
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);

        // Verify 90% was burnt via DETH (credited to payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 5% was credited to namespace creator
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 5% was credited to contract owner
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        expect(finalOwnerFees - initialOwnerFees).to.equal(expectedOwnerFee);
    });

    it("Should not distribute fees when owner registers with `msg.value > 0` during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "fee";
        const pricePerName = ethers.parseEther("0.009");
        const ethToSend = ethers.parseEther("200"); // Owner sends ETH even though it's free
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // Get initial state
        const initialDETHBurned = await s.deth.burned(s.owner.address);
        const initialCreatorFees = await s.xns.getPendingFees(s.owner.address);
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address);
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Owner registers namespace with ETH during initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerNamespace(namespace, pricePerName, { value: ethToSend });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get final state
        const finalDETHBurned = await s.deth.burned(s.owner.address);
        const finalCreatorFees = await s.xns.getPendingFees(s.owner.address);
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify namespace was registered but no fees were distributed
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);

        // Verify no DETH was credited (no burn occurred)
        expect(finalDETHBurned).to.equal(initialDETHBurned);

        // Verify no fees were credited to namespace creator (owner)
        expect(finalCreatorFees).to.equal(initialCreatorFees);

        // Verify no fees were credited to contract owner
        expect(finalOwnerFees).to.equal(initialOwnerFees);

        // Verify all ETH was refunded (balance only decreased by gas costs)
        const expectedBalanceAfter = balanceBefore - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should credit correct amount of DETH to non-owner registrant during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "deth";
        const pricePerName = ethers.parseEther("0.010");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // Get initial DETH burned amount for non-owner (user1)
        const initialDETHBurned = await s.deth.burned(s.user1.address);

        // Calculate expected DETH amount (90% of fee)
        const expectedDETHAmount = (fee * 90n) / 100n; // 90% = 180 ETH

        // ---------
        // Act: Non-owner (user1) registers namespace with fee during initial period
        // ---------
        await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);

        // Verify correct amount of DETH was credited to non-owner registrant (payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    it("Should credit correct amount of DETH to owner after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "own";
        const pricePerName = ethers.parseEther("0.011");
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

        // Get initial DETH burned amount for owner
        const initialDETHBurned = await s.deth.burned(s.owner.address);

        // Calculate expected DETH amount (90% of fee)
        const expectedDETHAmount = (fee * 90n) / 100n; // 90% = 180 ETH

        // ---------
        // Act: Owner registers namespace with fee after initial period
        // ---------
        await s.xns.connect(s.owner).registerNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);

        // Verify correct amount of DETH was credited to owner (payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.owner.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    it("Should credit correct amount of DETH to non-owner registrant after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "app";
        const pricePerName = ethers.parseEther("0.012");
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

        // Get initial DETH burned amount for non-owner (user2, to avoid conflicts with previous tests)
        const initialDETHBurned = await s.deth.burned(s.user2.address);

        // Calculate expected DETH amount (90% of fee)
        const expectedDETHAmount = (fee * 90n) / 100n; // 90% = 180 ETH

        // ---------
        // Act: Non-owner (user2) registers namespace with fee after initial period
        // ---------
        await s.xns.connect(s.user2).registerNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user2.address);

        // Verify namespace can be queried by price
        const getNamespaceInfoByPrice = s.xns.getFunction("getNamespaceInfo(uint256)");
        const [returnedNamespace] = await getNamespaceInfoByPrice(pricePerName);
        expect(returnedNamespace).to.equal(namespace);

        // Verify correct amount of DETH was credited to non-owner registrant (payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user2.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `NamespaceRegistered` event with correct parameters", async () => {
        // ---------
        // Arrange: Prepare parameters for namespace registration
        // ---------
        const namespace = "evt";
        const pricePerName = ethers.parseEther("0.013");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Register namespace and verify event emission
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        )
            .to.emit(s.xns, "NamespaceRegistered")
            .withArgs(namespace, pricePerName, s.user1.address);
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should revert with `XNS: invalid namespace` error for empty namespace", async () => {
        // ---------
        // Arrange: Prepare parameters with empty namespace
        // ---------
        const namespace = "";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for namespace longer than 4 characters", async () => {
        // ---------
        // Arrange: Prepare parameters with namespace longer than 4 characters
        // ---------
        const namespace = "abcde"; // 5 characters
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for namespace with invalid characters", async () => {
        // ---------
        // Arrange: Prepare parameters with namespace containing invalid characters
        // ---------
        const namespace = "aBc"; // Contains uppercase letter
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: 'eth' namespace forbidden` error when trying to register \"eth\" namespace", async () => {
        // ---------
        // Arrange: Prepare parameters with "eth" namespace
        // ---------
        const namespace = "eth";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register "eth" namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: 'eth' namespace forbidden");
    });

    it("Should revert with `XNS: pricePerName must be > 0` error for zero price", async () => {
        // ---------
        // Arrange: Prepare parameters with zero price
        // ---------
        const namespace = "zero";
        const pricePerName = 0n;
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace with zero price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: pricePerName must be > 0");
    });

    it("Should revert with `XNS: price must be multiple of 0.001 ETH` error for non-multiple price", async () => {
        // ---------
        // Arrange: Prepare parameters with price that is not a multiple of 0.001 ETH
        // ---------
        const namespace = "mult";
        const pricePerName = ethers.parseEther("0.0015"); // 0.0015 ETH is not a multiple of 0.001 ETH
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace with non-multiple price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: price must be multiple of 0.001 ETH");
    });

    it("Should revert with `XNS: price already in use` error when price is already mapped to another namespace", async () => {
        // ---------
        // Arrange: Register a namespace with a specific price first
        // ---------
        const namespace1 = "1st";
        const namespace2 = "2nd";
        const pricePerName = ethers.parseEther("0.014"); // Same price for both
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // Register first namespace
        await s.xns.connect(s.user1).registerNamespace(namespace1, pricePerName, { value: fee });

        // ---------
        // Act & Assert: Attempt to register another namespace with the same price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerNamespace(namespace2, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: price already in use");
    });

    it("Should revert with `XNS: namespace already exists` error when namespace already exists", async () => {
        // ---------
        // Arrange: Register a namespace first
        // ---------
        const namespace = "exst";
        const pricePerName1 = ethers.parseEther("0.015");
        const pricePerName2 = ethers.parseEther("0.016");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();

        // Register namespace with first price
        await s.xns.connect(s.user1).registerNamespace(namespace, pricePerName1, { value: fee });

        // ---------
        // Act & Assert: Attempt to register the same namespace again with different price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerNamespace(namespace, pricePerName2, { value: fee })
        ).to.be.revertedWith("XNS: namespace already exists");
    });

    it("Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters with insufficient fee and verify we're within the initial period
        // ---------
        const namespace = "insf";
        const pricePerName = ethers.parseEther("0.017");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        const insufficientFee = fee - ethers.parseEther("1"); // Pay 1 ETH less than required
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act & Assert: Attempt to register namespace with insufficient fee and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: insufficientFee })
        ).to.be.revertedWith("XNS: insufficient namespace fee");
    });

    it("Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time and prepare parameters with insufficient fee
        // ---------
        const namespace = "ins2";
        const pricePerName = ethers.parseEther("0.018");
        const fee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        const insufficientFee = fee - ethers.parseEther("1"); // Pay 1 ETH less than required
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
        // Act & Assert: Attempt to register namespace with insufficient fee and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerNamespace(namespace, pricePerName, { value: insufficientFee })
        ).to.be.revertedWith("XNS: insufficient namespace fee");
    });

    it("Should revert with `XNS: refund failed` error if refund to owner fails during initial period", async () => {
        // ---------
        // Arrange: Deploy a contract that reverts on receive and use it as owner
        // ---------
        // Deploy a contract that reverts when receiving ETH
        const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
        const revertingReceiver = await RevertingReceiver.deploy();
        await revertingReceiver.waitForDeployment();
        const revertingReceiverAddress = await revertingReceiver.getAddress();

        // Deploy a new XNS contract with the reverting receiver as owner
        const xnsWithRevertingOwner = await ethers.deployContract("XNS", [revertingReceiverAddress]);
        await xnsWithRevertingOwner.waitForDeployment();

        // Confirm we're within the initial period
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await xnsWithRevertingOwner.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await xnsWithRevertingOwner.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        const namespace = "rfnd";
        const pricePerName = ethers.parseEther("0.019");
        const ethToSend = ethers.parseEther("200"); // Owner sends ETH during free period

        // Impersonate the reverting receiver address and fund it so it can send transactions
        await impersonateAccount(revertingReceiverAddress);
        await ethers.provider.send("hardhat_setBalance", [
            revertingReceiverAddress,
            "0x1000000000000000000" // 1 ETH
        ]);
        const revertingReceiverSigner = await ethers.getSigner(revertingReceiverAddress);

        // ---------
        // Act & Assert: Attempt to register namespace and expect refund to fail
        // ---------
        await expect(
            xnsWithRevertingOwner.connect(revertingReceiverSigner).registerNamespace(namespace, pricePerName, { value: ethToSend })
        ).to.be.revertedWith("XNS: refund failed");
    });
    
  });

  describe("registerName", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should register a name correctly", async () => {
        // ---------
        // Arrange: Prepare name registration parameters (namespace "xns" is already registered in setup)
        // ---------
        const namespace = "xns";
        const label = "alice";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act: Register name with user2
        // ---------
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // ---------
        // Assert: Verify name was registered correctly
        // ---------
        // Should set name owner to msg.sender (user2)
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // Should map name hash to owner address (verify using getAddress with full name)
        // Note: Using short namespace "abc" (3 chars) so the dot is within the last 5 characters
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(s.user2.address);

        // Should map owner address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(s.user2.address);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace (verify by parsing the returned name)
        // The name format is "label.namespace"
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should allow namespace creator to register a paid name during exclusive period", async () => {
        // ---------
        // Arrange: Prepare name registration parameters (namespace "xns" is already registered in setup by user1)
        // ---------
        const namespace = "xns";
        const label = "bob";
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // Get user1 balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Namespace creator (user1) registers name during exclusive period
        // ---------
        const tx = await s.xns.connect(s.user1).registerName(label, namespace, { value: pricePerName });
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get user1 balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Assert: Verify name was registered correctly and payment was made
        // ---------
        // Should set name owner to namespace creator (user1)
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user1.address);

        // Should map owner address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(s.user1.address);
        const fullName = `${label}.${namespace}`;
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);

        // Should have paid for the name registration (balance decreased by pricePerName + gas costs)
        const expectedBalanceAfter = balanceBefore - pricePerName - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should allow anyone to register paid names after exclusive period (30 days)", async () => {
        // ---------
        // Arrange: Fast-forward time past the exclusivity period
        // ---------
        const namespace = "xns";
        const label = "charlie";
        const pricePerName = ethers.parseEther("0.001");

        // Get namespace info to check exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        
        // Fast-forward time past the exclusivity period (30 days + 1 day to be safe)
        const timeToAdd = Number(exclusivityPeriod) + 86400; // 30 days + 1 day in seconds
        await time.increase(timeToAdd);

        // Verify we're past the exclusivity period
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.gte(Number(createdAt) + Number(exclusivityPeriod));

        // Get user2 balance before transaction (user2 is not the namespace creator)
        const balanceBefore = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Act: Non-creator (user2) registers name after exclusive period
        // ---------
        const tx = await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get user2 balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Assert: Verify name was registered correctly and payment was made
        // ---------
        // Should set name owner to msg.sender (user2, who is not the namespace creator)
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // Should map owner address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(s.user2.address);
        const fullName = `${label}.${namespace}`;
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);

        // Should have paid for the name registration (balance decreased by pricePerName + gas costs)
        const expectedBalanceAfter = balanceBefore - pricePerName - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should process the ETH payment correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid", async () => {
        // ---------
        // Arrange: Prepare parameters and get initial state
        // ---------
        const namespace = "xns";
        const label = "dave";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get initial state
        // user2 is the payer, user1 is the namespace creator
        const initialDETHBurned = await s.deth.burned(s.user2.address);
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address);
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address);
        
        // Calculate expected amounts
        const expectedBurnAmount = (pricePerName * 90n) / 100n; // 90% of 0.001 ETH
        const expectedCreatorFee = (pricePerName * 5n) / 100n; // 5% of 0.001 ETH
        const expectedOwnerFee = pricePerName - expectedBurnAmount - expectedCreatorFee; // 5% of 0.001 ETH

        // ---------
        // Act: Non-creator (user2) registers name with fee
        // ---------
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // ---------
        // Assert: Verify payment processing
        // ---------
        // Verify name was registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // Verify 90% was burnt via DETH (credited to payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user2.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 5% was credited to namespace creator (user1)
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 5% was credited to contract owner
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        expect(finalOwnerFees - initialOwnerFees).to.equal(expectedOwnerFee);
    });

    it("Should refund excess payment when `msg.value` exceeds namespace price", async () => {
        // ---------
        // Arrange: Prepare parameters with excess payment
        // ---------
        const namespace = "xns";
        const label = "eve";
        const pricePerName = ethers.parseEther("0.001");
        const excessPayment = ethers.parseEther("0.0005"); // Pay 0.0005 ETH more than required
        const totalPayment = pricePerName + excessPayment; // 0.0015 ETH total

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get user2 balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Act: Register name with excess payment
        // ---------
        const tx = await s.xns.connect(s.user2).registerName(label, namespace, { value: totalPayment });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get user2 balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Assert: Verify name was registered and excess was refunded
        // ---------
        // Verify name was registered correctly
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // Verify namespace can be queried
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(s.user2.address);
        const fullName = `${label}.${namespace}`;
        expect(returnedName).to.equal(fullName);

        // Verify refund: balance should decrease by pricePerName (0.001 ETH) + gas costs (excess was refunded)
        // balanceAfter should equal balanceBefore - pricePerName - gasCost
        const expectedBalanceAfter = balanceBefore - pricePerName - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should permit anyone (non-namespace-creator) to register a name in the special \"x\" namespace (100 ETH) after the exclusive period ends", async () => {
        // ---------
        // Arrange: Prepare parameters for special namespace "x"
        // ---------
        const namespace = "x";
        const label = "frank";
        const specialNamespacePrice = await s.xns.SPECIAL_NAMESPACE_PRICE(); // 100 ETH

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify special namespace exists and has correct price
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(specialNamespacePrice);
        expect(creator).to.equal(s.owner.address); // Owner is the creator of special namespace

        // Get user2 balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Act: Register name in special namespace "x"
        // ---------
        const tx = await s.xns.connect(s.user2).registerName(label, namespace, { value: specialNamespacePrice });
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get user2 balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Assert: Verify name was registered correctly and payment was made
        // ---------
        // Should set name owner to msg.sender (user2)
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // Should map owner address to name (bare name format - just the label without ".x")
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(s.user2.address);
        expect(returnedName).to.equal(label); // Bare names return just the label, not "label.x"

        // Should have paid for the name registration (balance decreased by specialNamespacePrice + gas costs)
        const expectedBalanceAfter = balanceBefore - specialNamespacePrice - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should credit correct amount of DETH to `msg.sender`", async () => {
        // ---------
        // Arrange: Prepare parameters and get initial DETH state
        // ---------
        const namespace = "xns"; // Already registered in setup with price 0.001 ETH
        const label = "dethuser";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get initial DETH burned amount for msg.sender (user2)
        const initialDETHBurned = await s.deth.burned(s.user2.address);

        // Calculate expected DETH amount (90% of pricePerName)
        const expectedDETHAmount = (pricePerName * 90n) / 100n; // 90% = 0.0009 ETH

        // ---------
        // Act: Register name (user2 is msg.sender)
        // ---------
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // ---------
        // Assert: Verify name was registered and DETH was credited correctly
        // ---------
        // Verify name was registered correctly
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // Verify correct amount of DETH was credited to msg.sender (user2, the payer)
        const finalDETHBurned = await s.deth.burned(s.user2.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    it("Should credit correct amount of DETH to namespace creator (`msg.sender`) during exclusive period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const label = "creator";
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // Get initial DETH burned amount for namespace creator (user1)
        const initialDETHBurned = await s.deth.burned(s.user1.address);

        // Calculate expected DETH amount (90% of pricePerName)
        const expectedDETHAmount = (pricePerName * 90n) / 100n; // 90% = 0.0009 ETH

        // ---------
        // Act: Namespace creator (user1) registers name during exclusive period
        // ---------
        await s.xns.connect(s.user1).registerName(label, namespace, { value: pricePerName });

        // ---------
        // Assert: Verify name was registered and DETH was credited correctly
        // ---------
        // Verify name was registered correctly
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user1.address);

        // Verify correct amount of DETH was credited to namespace creator (user1, the msg.sender)
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `NameRegistered` event with correct parameters", async () => {
        // ---------
        // Arrange: Prepare name registration parameters
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "eventtest";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act & Assert: Register name and verify event emission
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName })
        )
            .to.emit(s.xns, "NameRegistered")
            .withArgs(label, namespace, s.user2.address);
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should revert with `XNS: invalid label` error for invalid label", async () => {
        // ---------
        // Arrange: Prepare parameters with invalid label
        // ---------
        const namespace = "xns"; // Already registered in setup
        const invalidLabel = "InvalidLabel"; // Contains uppercase letter
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(invalidLabel, namespace, { value: pricePerName })
        ).to.be.revertedWith("XNS: invalid label");
    });

    it("Should revert with `XNS: namespace not found` error when namespace doesn't exist", async () => {
        // ---------
        // Arrange: Prepare parameters with non-existent namespace
        // ---------
        const namespace = "nex";
        const label = "test";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName })
        ).to.be.revertedWith("XNS: namespace not found");
    });

    it("Should revert with `XNS: insufficient payment` error when `msg.value` is less than namespace price", async () => {
        // ---------
        // Arrange: Prepare parameters with insufficient payment
        // ---------
        const namespace = "xns"; // Already registered in setup with price 0.001 ETH
        const label = "test";
        const pricePerName = ethers.parseEther("0.001");
        const insufficientPayment = ethers.parseEther("0.0005"); // Less than required

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(label, namespace, { value: insufficientPayment })
        ).to.be.revertedWith("XNS: insufficient payment");
    });
    
  });
});

