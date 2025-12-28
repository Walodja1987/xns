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
    eip1271Wallet: any; // EIP-1271 contract wallet instance
    deploymentBlockTimestamp: number;
    deploymentReceipt: any;
    signRegisterNameAuth: (signer: SignerWithAddress, recipient: string, label: string, namespace: string) => Promise<string>;
  }

  // Helper function to sign RegisterNameAuth for EIP-712
  async function signRegisterNameAuth(
    xns: XNS,
    signer: SignerWithAddress,
    recipient: string,
    label: string,
    namespace: string
  ): Promise<string> {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "XNS",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: await xns.getAddress(),
    };

    const types = {
      RegisterNameAuth: [
        { name: "recipient", type: "address" },
        { name: "labelHash", type: "bytes32" },
        { name: "namespaceHash", type: "bytes32" },
      ],
    };

    const value = {
      recipient: recipient,
      labelHash: ethers.keccak256(ethers.toUtf8Bytes(label)),
      namespaceHash: ethers.keccak256(ethers.toUtf8Bytes(namespace)),
    };

    return await signer.signTypedData(domain, types, value);
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

    // Deploy EIP-1271 wallet with user2 as the owner
    const EIP1271Wallet = await ethers.getContractFactory("EIP1271Wallet");
    const eip1271Wallet = await EIP1271Wallet.deploy(user2.address);
    await eip1271Wallet.waitForDeployment();

    return {
      xns,
      owner,
      user1,
      user2,
      deth,
      eip1271Wallet,
      deploymentBlockTimestamp: deploymentBlock!.timestamp,
      deploymentReceipt: deploymentReceipt!,
      signRegisterNameAuth: (signer: SignerWithAddress, recipient: string, label: string, namespace: string) =>
        signRegisterNameAuth(xns, signer, recipient, label, namespace),
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

    it("Should allow a contract to register a name for itself via `registerName` (in constructor)", async () => {
        // ---------
        // Arrange: Prepare parameters for contract deployment
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "contractself";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act: Deploy contract that registers name in constructor
        // ---------
        const SelfRegisteringContract = await ethers.getContractFactory("SelfRegisteringContract");
        const contract = await SelfRegisteringContract.deploy(
            await s.xns.getAddress(),
            label,
            namespace,
            { value: pricePerName }
        );
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();

        // ---------
        // Assert: Verify name was registered correctly to the contract address
        // ---------
        // Should set name owner to contract address
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(contractAddress);

        // Should map name hash to contract address
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(contractAddress);

        // Should map contract address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(contractAddress);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should allow a contract to register a name for itself via `registerName` (after deployment)", async () => {
        // ---------
        // Arrange: Deploy contract without registering in constructor
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "contractpost";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Deploy contract without registering (empty label)
        const SelfRegisteringContract = await ethers.getContractFactory("SelfRegisteringContract");
        const contract = await SelfRegisteringContract.deploy(
            await s.xns.getAddress(),
            "",
            "",
            { value: 0 }
        );
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();

        // Verify contract doesn't have a name yet
        const getName = s.xns.getFunction("getName(address)");
        const nameBefore = await getName(contractAddress);
        expect(nameBefore).to.equal("");

        // ---------
        // Act: Contract registers name for itself after deployment
        // ---------
        await contract.registerName(label, namespace, { value: pricePerName });

        // ---------
        // Assert: Verify name was registered correctly to the contract address
        // ---------
        // Should set name owner to contract address
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(contractAddress);

        // Should map name hash to contract address
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(contractAddress);

        // Should map contract address to name
        const returnedName = await getName(contractAddress);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
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

    it("Should revert with `XNS: not namespace creator` error when non-creator tries to register during exclusive period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const label = "test";
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // ---------
        // Act & Assert: Attempt to register name as non-creator (user2) and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName })
        ).to.be.revertedWith("XNS: not namespace creator");
    });

    it("Should revert with `XNS: address already has a name` error when address already owns a name", async () => {
        // ---------
        // Arrange: Register a name first, then try to register another
        // ---------
        const namespace = "xns"; // Already registered in setup
        const firstLabel = "firstname";
        const secondLabel = "secondname";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register first name for user2
        await s.xns.connect(s.user2).registerName(firstLabel, namespace, { value: pricePerName });

        // Verify user2 has a name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(s.user2.address);
        expect(returnedName).to.equal(`${firstLabel}.${namespace}`);

        // ---------
        // Act & Assert: Attempt to register another name for the same address and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(secondLabel, namespace, { value: pricePerName })
        ).to.be.revertedWith("XNS: address already has a name");
    });

    it("Should revert with `XNS: name already registered` error when name is already registered", async () => {
        // ---------
        // Arrange: Register a name first, then try to register the same name again
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "duplicate";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register name for user2
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // Verify name is registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(s.user2.address);

        // ---------
        // Act & Assert: Attempt to register the same name again and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerName(label, namespace, { value: pricePerName })
        ).to.be.revertedWith("XNS: name already registered");
    });
    
  });

  describe("registerNameWithAuthorization", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should register a name for recipient when recipient authorizes via signature", async () => {
        // ---------
        // Arrange: Prepare parameters and create signature
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "alice";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act: Sponsor registers name for recipient (user1 sponsors, user2 is recipient)
        // ---------
        await s.xns.connect(s.user1).registerNameWithAuthorization(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: pricePerName }
        );

        // ---------
        // Assert: Verify name was registered correctly
        // ---------
        // Should set name owner to recipient, not msg.sender
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(recipient); // recipient, not user1 (msg.sender)
        expect(ownerAddress).to.not.equal(s.user1.address); // msg.sender should not be the owner

        // Should map name hash to recipient address
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(recipient);

        // Should map recipient address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(recipient);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should allow namespace creator to sponsor registrations during exclusive period (30 days)", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const label = "sponsored";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act: Namespace creator (user1) sponsors registration for recipient during exclusivity period
        // ---------
        await s.xns.connect(s.user1).registerNameWithAuthorization(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: pricePerName }
        );

        // ---------
        // Assert: Verify name was registered correctly
        // ---------
        // Should set name owner to recipient, not msg.sender
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(recipient); // recipient, not user1 (msg.sender)
        expect(ownerAddress).to.not.equal(s.user1.address); // msg.sender should not be the owner

        // Should map name hash to recipient address
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(recipient);

        // Should map recipient address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(recipient);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should allow anyone to sponsor registrations after exclusive period (30 days)", async () => {
        // ---------
        // Arrange: Prepare parameters and fast-forward past exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const label = "publicsponsored";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify we're past the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.gte(Number(createdAt) + Number(exclusivityPeriod));

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // Note: We'll use owner (not namespace creator) as the sponsor to verify anyone can sponsor
        // ---------
        // Act: Non-creator (owner) sponsors registration for recipient after exclusivity period
        // ---------
        await s.xns.connect(s.owner).registerNameWithAuthorization(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: pricePerName }
        );

        // ---------
        // Assert: Verify name was registered correctly
        // ---------
        // Should set name owner to recipient, not msg.sender
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(recipient); // recipient, not owner (msg.sender)
        expect(ownerAddress).to.not.equal(s.owner.address); // msg.sender should not be the owner

        // Should map name hash to recipient address
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(recipient);

        // Should map recipient address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(recipient);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should process the ETH payment correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid", async () => {
        // ---------
        // Arrange: Prepare parameters and get initial state
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const label = "paymenttest";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get initial state
        const initialDETHBurned = await s.deth.burned(s.owner.address); // owner is the sponsor/payer
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address); // user1 is namespace creator
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address); // owner is contract owner

        // Calculate expected amounts
        const expectedBurnAmount = (pricePerName * 90n) / 100n; // 90% = 0.0009 ETH
        const expectedCreatorFee = (pricePerName * 5n) / 100n; // 5% = 0.00005 ETH
        const expectedOwnerFee = pricePerName - expectedBurnAmount - expectedCreatorFee; // 5% = 0.00005 ETH

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act: Sponsor registers name for recipient (owner sponsors, user2 is recipient)
        // ---------
        await s.xns.connect(s.owner).registerNameWithAuthorization(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: pricePerName }
        );

        // ---------
        // Assert: Verify payment was processed correctly
        // ---------
        // Verify 90% was burnt via DETH (credited to payer/sponsor - owner)
        const finalDETHBurned = await s.deth.burned(s.owner.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 5% was credited to namespace creator (user1)
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 5% was credited to contract owner (owner)
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        expect(finalOwnerFees - initialOwnerFees).to.equal(expectedOwnerFee);
    });

    it("Should allow sponsoring a name registration for an EIP-1271 contract wallet recipient", async () => {
        // ---------
        // Arrange: Prepare parameters (EIP-1271 wallet is already deployed in setup)
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "contractwallet";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get wallet address from setup
        const walletAddress = await s.eip1271Wallet.getAddress();

        // Verify wallet owner is user2
        expect(await s.eip1271Wallet.owner()).to.equal(s.user2.address);

        // Create signature from wallet owner (user2) for the authorization
        // The signature will be validated by the wallet's isValidSignature function
        const signature = await s.signRegisterNameAuth(s.user2, walletAddress, label, namespace);

        // ---------
        // Act: Sponsor registers name for contract wallet recipient
        // ---------
        await s.xns.connect(s.owner).registerNameWithAuthorization(
            {
                recipient: walletAddress,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: pricePerName }
        );

        // ---------
        // Assert: Verify name was registered correctly to the contract wallet
        // ---------
        // Should set name owner to contract wallet address, not msg.sender
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(walletAddress); // wallet address, not owner (msg.sender)
        expect(ownerAddress).to.not.equal(s.owner.address); // msg.sender should not be the owner

        // Should map name hash to contract wallet address
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(walletAddress);

        // Should map contract wallet address to name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(walletAddress);
        expect(returnedName).to.equal(fullName);

        // Should set correct label and namespace
        const [returnedLabel, returnedNamespace] = returnedName.split(".");
        expect(returnedLabel).to.equal(label);
        expect(returnedNamespace).to.equal(namespace);
    });

    it("Should refund excess payment when `msg.value` exceeds namespace price", async () => {
        // ---------
        // Arrange: Prepare parameters with excess payment
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "refundtest";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");
        const excessPayment = ethers.parseEther("0.0005"); // Pay 0.0005 ETH more than required
        const totalPayment = pricePerName + excessPayment; // 0.0015 ETH total

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // Get sponsor (owner) balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Sponsor registers name for recipient with excess payment
        // ---------
        const tx = await s.xns.connect(s.owner).registerNameWithAuthorization(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get sponsor balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify name was registered and excess was refunded
        // ---------
        // Verify name was registered correctly
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(recipient);

        // Verify refund: balance should decrease by pricePerName + gas costs (excess was refunded)
        // balanceAfter should equal balanceBefore - pricePerName - gasCost
        const expectedBalanceAfter = balanceBefore - pricePerName - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should permit anyone (non-namespace-creator) to register a name in the special \"x\" namespace (100 ETH) after the exclusive period ends", async () => {
        // ---------
        // Arrange: Prepare parameters for special namespace "x"
        // ---------
        const namespace = "x";
        const label = "specialsponsored";
        const recipient = s.user2.address; // user2 is the recipient
        const specialNamespacePrice = await s.xns.SPECIAL_NAMESPACE_PRICE(); // 100 ETH

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify special namespace exists and has correct price
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(specialNamespacePrice);
        expect(creator).to.equal(s.owner.address); // Owner is the creator of special namespace

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // Get sponsor (user1, non-creator) balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Non-creator (user1) sponsors registration for recipient in special namespace "x"
        // ---------
        const tx = await s.xns.connect(s.user1).registerNameWithAuthorization(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature,
            { value: specialNamespacePrice }
        );
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get sponsor balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Assert: Verify name was registered correctly and payment was made
        // ---------
        // Should set name owner to recipient, not msg.sender
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(recipient); // recipient, not user1 (msg.sender)
        expect(ownerAddress).to.not.equal(s.user1.address); // msg.sender should not be the owner

        // Should map owner address to name (bare name format - just the label without ".x")
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(recipient);
        expect(returnedName).to.equal(label); // Bare names return just the label, not "label.x"

        // Should have paid for the name registration (balance decreased by specialNamespacePrice + gas costs)
        const expectedBalanceAfter = balanceBefore - specialNamespacePrice - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `NameRegistered` event with recipient as owner", async () => {
        // ---------
        // Arrange: Prepare name registration parameters
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "eventtest";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act & Assert: Sponsor registers name and verify event emission
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        )
            .to.emit(s.xns, "NameRegistered")
            .withArgs(label, namespace, recipient); // recipient is the owner, not msg.sender (owner)
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
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature (will fail label validation before signature check)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, invalidLabel, namespace);

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: invalidLabel,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: invalid label");
    });

    it("Should revert with `XNS: 0x recipient` error when recipient is `address(0)`", async () => {
        // ---------
        // Arrange: Prepare parameters with zero address recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "test";
        const recipient = ethers.ZeroAddress; // Zero address
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature (will fail recipient validation before signature check)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: 0x recipient");
    });

    it("Should revert with `XNS: namespace not found` error for non-existent namespace", async () => {
        // ---------
        // Arrange: Prepare parameters with non-existent namespace
        // ---------
        const namespace = "nex";
        const label = "test";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature (will fail namespace validation before signature check)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: namespace not found");
    });

    it("Should revert with `XNS: insufficient payment` error when msg.value is less than namespace price", async () => {
        // ---------
        // Arrange: Prepare parameters with insufficient payment
        // ---------
        const namespace = "xns"; // Already registered in setup with price 0.001 ETH
        const label = "test";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");
        const insufficientPayment = ethers.parseEther("0.0005"); // Less than required

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act & Assert: Attempt to register name and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: insufficientPayment }
            )
        ).to.be.revertedWith("XNS: insufficient payment");
    });

    it("Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor during exclusive period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const label = "test";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act & Assert: Attempt to sponsor registration as non-creator (owner) and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: not namespace creator");
    });

    it("Should revert with `XNS: recipient already has a name` error when recipient already owns a name", async () => {
        // ---------
        // Arrange: Register a name first, then try to register another for the same recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const firstLabel = "firstname";
        const secondLabel = "secondname";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register first name for recipient (user2) using registerName
        await s.xns.connect(s.user2).registerName(firstLabel, namespace, { value: pricePerName });

        // Verify recipient has a name
        const getName = s.xns.getFunction("getName(address)");
        const returnedName = await getName(recipient);
        expect(returnedName).to.equal(`${firstLabel}.${namespace}`);

        // Create signature for second name (will fail recipient validation)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, secondLabel, namespace);

        // ---------
        // Act & Assert: Attempt to register another name for the same recipient and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: secondLabel,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: recipient already has a name");
    });

    it("Should revert with `XNS: name already registered` error when name is already registered", async () => {
        // ---------
        // Arrange: Register a name first, then try to register the same name for a different recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "duplicate";
        const firstRecipient = s.user2.address;
        const secondRecipient = s.user1.address; // Different recipient who doesn't have a name yet
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register name for firstRecipient (user2) using registerName
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // Verify name is registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(firstRecipient);

        // Verify secondRecipient doesn't have a name yet (so we don't hit "recipient already has a name" first)
        const getName = s.xns.getFunction("getName(address)");
        const secondRecipientName = await getName(secondRecipient);
        expect(secondRecipientName).to.equal(""); // Empty string means no name

        // Create signature for the same name but different recipient (will fail name validation)
        const signature = await s.signRegisterNameAuth(s.user1, secondRecipient, label, namespace);

        // ---------
        // Act & Assert: Attempt to register the same name for a different recipient and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: secondRecipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: name already registered");
    });

    it("Should revert with `XNS: bad authorization` error for invalid signature", async () => {
        // ---------
        // Arrange: Prepare parameters with invalid signature
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "test";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create an invalid signature (random bytes)
        const invalidSignature = ethers.randomBytes(65);

        // ---------
        // Act & Assert: Attempt to register name with invalid signature and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                invalidSignature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: bad authorization");
    });

    it("Should revert with `XNS: bad authorization` error when signature is from wrong recipient", async () => {
        // ---------
        // Arrange: Prepare parameters with signature from wrong recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "test";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Create signature from user1 (wrong recipient) instead of user2 (the actual recipient)
        const signature = await s.signRegisterNameAuth(s.user1, recipient, label, namespace);

        // ---------
        // Act & Assert: Attempt to register name with signature from wrong recipient and expect revert
        // ---------
        await expect(
            s.xns.connect(s.owner).registerNameWithAuthorization(
                {
                    recipient: recipient,
                    label: label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            )
        ).to.be.revertedWith("XNS: bad authorization");
    });
    
  });

  describe("batchRegisterNameWithAuthorization", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should register multiple names in a single transaction", async () => {
        // ---------
        // Arrange: Prepare parameters for batch registration
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare multiple registrations
        const registrations = [
            { label: "alice", recipient: s.user1.address },
            { label: "bob", recipient: s.user2.address },
            { label: "charlie", recipient: s.owner.address },
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment needed
        const totalPayment = pricePerName * BigInt(registrations.length);

        // Verify expected return value using staticCall
        const expectedSuccessfulCount = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization.staticCall(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        expect(expectedSuccessfulCount).to.equal(BigInt(registrations.length));

        // ---------
        // Act: Sponsor batch registration for multiple recipients
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify all names were registered correctly
        // ---------
        // Verify return value matches expected (via event count)
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));
        expect(events.length).to.equal(registrations.length);

        // Should set name owners to recipients
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        for (const reg of registrations) {
            const ownerAddress = await getAddressByLabelAndNamespace(reg.label, namespace);
            expect(ownerAddress).to.equal(reg.recipient);
        }

        // Should verify mappings for all successful registrations
        const getName = s.xns.getFunction("getName(address)");
        for (const reg of registrations) {
            // Should map name hash to recipient address
            const fullName = `${reg.label}.${namespace}`;
            const getAddressByFullName = s.xns.getFunction("getAddress(string)");
            const ownerAddressByFullName = await getAddressByFullName(fullName);
            expect(ownerAddressByFullName).to.equal(reg.recipient);

            // Should map recipient address to name
            const returnedName = await getName(reg.recipient);
            expect(returnedName).to.equal(fullName);

            // Should set correct label and namespace
            const [returnedLabel, returnedNamespace] = returnedName.split(".");
            expect(returnedLabel).to.equal(reg.label);
            expect(returnedNamespace).to.equal(namespace);
        }

        // Should require same namespace for all registrations (verified by successful execution).
        // All registrations used the same namespace, so if the transaction succeeded, this is verified.

    });

    it("Should skip registrations where recipient already has a name", async () => {
        // ---------
        // Arrange: Prepare parameters and register a name for one recipient first
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // First, register a name for user1 so they already have a name
        const firstLabel = "firstname";
        await s.xns.connect(s.user1).registerName(firstLabel, namespace, { value: pricePerName });

        // Verify user1 has a name
        const getName = s.xns.getFunction("getName(address)");
        const user1Name = await getName(s.user1.address);
        expect(user1Name).to.equal(`${firstLabel}.${namespace}`);

        // Prepare batch registrations: user1 (already has name), user2 (new), owner (new)
        const registrations = [
            { label: "alice", recipient: s.user1.address }, // user1 already has a name - should be skipped
            { label: "bob", recipient: s.user2.address }, // user2 doesn't have a name - should succeed
            { label: "charlie", recipient: s.owner.address }, // owner doesn't have a name - should succeed
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment for all registrations (but only 2 should succeed)
        const totalPayment = pricePerName * BigInt(registrations.length);
        const expectedSuccessfulCount = 2n; // user2 and owner, but not user1

        // Get initial balances for payment verification
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Sponsor batch registration (user1 should be skipped)
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify user1's registration was skipped, others succeeded
        // ---------
        // Verify return value (should be 2, not 3)
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify user1 still has their original name (not the new one)
        const user1NameAfter = await getName(s.user1.address);
        expect(user1NameAfter).to.equal(`${firstLabel}.${namespace}`); // Original name, not "alice.xns"
        
        // Verify "alice.xns" was not registered (should return address(0))
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const aliceOwner = await getAddressByLabelAndNamespace("alice", namespace);
        expect(aliceOwner).to.equal(ethers.ZeroAddress);

        // Verify user2's registration succeeded
        const bobOwner = await getAddressByLabelAndNamespace("bob", namespace);
        expect(bobOwner).to.equal(s.user2.address);
        const user2Name = await getName(s.user2.address);
        expect(user2Name).to.equal(`bob.${namespace}`);

        // Verify owner's registration succeeded
        const charlieOwner = await getAddressByLabelAndNamespace("charlie", namespace);
        expect(charlieOwner).to.equal(s.owner.address);
        const ownerName = await getName(s.owner.address);
        expect(ownerName).to.equal(`charlie.${namespace}`);

        // Verify payment: should only charge for 2 successful registrations, refund the rest
        // balanceAfter should equal balanceBefore - (pricePerName * 2) - gasCost
        const expectedBalanceAfter = balanceBefore - (pricePerName * expectedSuccessfulCount) - BigInt(gasCost.toString());
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should skip registrations where name is already registered", async () => {
        // ---------
        // Arrange: Prepare parameters and register a name first
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // First, register "alice.xns" for user1
        const existingLabel = "alice";
        await s.xns.connect(s.user1).registerName(existingLabel, namespace, { value: pricePerName });

        // Verify the name is registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const existingOwner = await getAddressByLabelAndNamespace(existingLabel, namespace);
        expect(existingOwner).to.equal(s.user1.address);

        // Prepare batch registrations: "alice" (already registered), "bob" (new), "charlie" (new)
        const registrations = [
            { label: existingLabel, recipient: s.user2.address }, // "alice" already registered - should be skipped
            { label: "bob", recipient: s.user2.address }, // user2 doesn't have a name - should succeed
            { label: "charlie", recipient: s.owner.address }, // owner doesn't have a name - should succeed
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment for all registrations (but only 2 should succeed)
        const totalPayment = pricePerName * BigInt(registrations.length);
        const expectedSuccessfulCount = 2n; // "bob" and "charlie", but not "alice"

        // Get initial balances for payment verification
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Sponsor batch registration ("alice" should be skipped)
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * BigInt(gasPrice.toString());

        // Get balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify "alice" registration was skipped, others succeeded
        // ---------
        // Verify return value (should be 2, not 3)
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify "alice.xns" still belongs to user1 (not user2)
        const aliceOwnerAfter = await getAddressByLabelAndNamespace(existingLabel, namespace);
        expect(aliceOwnerAfter).to.equal(s.user1.address); // Still user1, not user2
        expect(aliceOwnerAfter).to.not.equal(s.user2.address); // user2 did not get it

        // Verify user2's "bob.xns" registration succeeded
        const bobOwner = await getAddressByLabelAndNamespace("bob", namespace);
        expect(bobOwner).to.equal(s.user2.address);
        const getName = s.xns.getFunction("getName(address)");
        const user2Name = await getName(s.user2.address);
        expect(user2Name).to.equal(`bob.${namespace}`);

        // Verify owner's "charlie.xns" registration succeeded
        const charlieOwner = await getAddressByLabelAndNamespace("charlie", namespace);
        expect(charlieOwner).to.equal(s.owner.address);
        const ownerName = await getName(s.owner.address);
        expect(ownerName).to.equal(`charlie.${namespace}`);

        // Verify payment: should only charge for 2 successful registrations, refund the rest
        // balanceAfter should equal balanceBefore - (pricePerName * 2) - gasCost
        const expectedBalanceAfter = balanceBefore - (pricePerName * expectedSuccessfulCount) - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should return 0 if no registrations succeed and refund all payment", async () => {
        // ---------
        // Arrange: Prepare parameters where all registrations will be skipped
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // First, register names for all recipients so they all already have names
        await s.xns.connect(s.user1).registerName("first", namespace, { value: pricePerName });
        await s.xns.connect(s.user2).registerName("second", namespace, { value: pricePerName });
        await s.xns.connect(s.owner).registerName("third", namespace, { value: pricePerName });

        // Verify all recipients have names
        const getName = s.xns.getFunction("getName(address)");
        expect(await getName(s.user1.address)).to.equal("first.xns");
        expect(await getName(s.user2.address)).to.equal("second.xns");
        expect(await getName(s.owner.address)).to.equal("third.xns");

        // Prepare batch registrations where all recipients already have names (all will be skipped)
        const registrations = [
            { label: "alice", recipient: s.user1.address }, // user1 already has a name - will be skipped
            { label: "bob", recipient: s.user2.address }, // user2 already has a name - will be skipped
            { label: "charlie", recipient: s.owner.address }, // owner already has a name - will be skipped
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment (but none should succeed)
        const totalPayment = pricePerName * BigInt(registrations.length);
        const expectedSuccessfulCount = 0n; // All should be skipped

        // Get initial balance for payment verification
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Sponsor batch registration (all should be skipped)
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * BigInt(gasPrice.toString());

        // Get balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify no registrations succeeded and all payment was refunded
        // ---------
        // Verify return value (should be 0)
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify no new names were registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const aliceOwner = await getAddressByLabelAndNamespace("alice", namespace);
        expect(aliceOwner).to.equal(ethers.ZeroAddress); // Not registered
        const bobOwner = await getAddressByLabelAndNamespace("bob", namespace);
        expect(bobOwner).to.equal(ethers.ZeroAddress); // Not registered
        const charlieOwner = await getAddressByLabelAndNamespace("charlie", namespace);
        expect(charlieOwner).to.equal(ethers.ZeroAddress); // Not registered

        // Verify all recipients still have their original names
        expect(await getName(s.user1.address)).to.equal("first.xns");
        expect(await getName(s.user2.address)).to.equal("second.xns");
        expect(await getName(s.owner.address)).to.equal("third.xns");

        // Verify payment: should refund all payment (only gas cost should be deducted)
        // balanceAfter should equal balanceBefore - gasCost (all payment refunded)
        const expectedBalanceAfter = balanceBefore - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should process the ETH payment correctly (90% burnt via DETH, 5% to namespace creator, 5% to contract owner) only for successful registrations", async () => {
        // ---------
        // Arrange: Prepare parameters with some registrations that will be skipped
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // First, register a name for user1 so they already have a name (will be skipped)
        await s.xns.connect(s.user1).registerName("existing", namespace, { value: pricePerName });

        // Prepare batch registrations: user1 (already has name - skip), user2 (new - succeed), owner (new - succeed)
        const registrations = [
            { label: "alice", recipient: s.user1.address }, // user1 already has a name - will be skipped
            { label: "bob", recipient: s.user2.address }, // user2 doesn't have a name - will succeed
            { label: "charlie", recipient: s.owner.address }, // owner doesn't have a name - will succeed
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment (but only 2 should succeed)
        const totalPayment = pricePerName * BigInt(registrations.length);
        const expectedSuccessfulCount = 2n; // user2 and owner, but not user1

        // Get initial state for payment verification
        const initialDETHBurned = await s.deth.burned(s.owner.address); // owner is the sponsor/payer
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address); // user1 is namespace creator
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address); // owner is contract owner

        // Calculate expected amounts (only for 2 successful registrations)
        const actualTotal = pricePerName * expectedSuccessfulCount;
        const expectedBurnAmount = (actualTotal * 90n) / 100n; // 90% of 2 * 0.001 ETH
        const expectedCreatorFee = (actualTotal * 5n) / 100n; // 5% of 2 * 0.001 ETH
        const expectedOwnerFee = actualTotal - expectedBurnAmount - expectedCreatorFee; // 5% of 2 * 0.001 ETH

        // ---------
        // Act: Sponsor batch registration (user1 should be skipped)
        // ---------
        await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );

        // ---------
        // Assert: Verify payment processing only for successful registrations
        // ---------
        // Verify 90% was burnt via DETH (credited to payer/sponsor - owner) for 2 successful registrations only
        const finalDETHBurned = await s.deth.burned(s.owner.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 5% was credited to namespace creator (user1) for 2 successful registrations only
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 5% was credited to contract owner (owner) for 2 successful registrations only
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        expect(finalOwnerFees - initialOwnerFees).to.equal(expectedOwnerFee);

        // Verify that payment was only processed for 2 registrations, not 3
        // If it processed for 3, the amounts would be 50% higher
        const expectedIfAllProcessed = (pricePerName * 3n * 90n) / 100n;
        expect(finalDETHBurned - initialDETHBurned).to.not.equal(expectedIfAllProcessed);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount); // Only 2 processed
    });

    it("Should credit correct amount of DETH to sponsor, not recipients", async () => {
        // ---------
        // Arrange: Prepare parameters with multiple recipients (distinct from sponsor)
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");
    
        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day
    
        // Prepare batch registrations: user1 and user2 as recipients (sponsor is owner)
        const registrations = [
            { label: "alice", recipient: s.user1.address }, // user1 is recipient
            { label: "bob", recipient: s.user2.address }, // user2 is recipient
        ];
    
        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }
    
        // Calculate total payment
        const totalPayment = pricePerName * BigInt(registrations.length);
        const expectedSuccessfulCount = 2n; // Both should succeed
    
        // Get initial DETH state for sponsor (owner) and recipients (user1, user2)
        const initialDETHBurnedSponsor = await s.deth.burned(s.owner.address); // owner is the sponsor
        const initialDETHBurnedUser1 = await s.deth.burned(s.user1.address); // user1 is a recipient
        const initialDETHBurnedUser2 = await s.deth.burned(s.user2.address); // user2 is a recipient
    
        // Calculate expected DETH amount (90% of total payment for 2 registrations)
        const actualTotal = pricePerName * expectedSuccessfulCount;
        const expectedDETHAmount = (actualTotal * 90n) / 100n; // 90% of 2 * 0.001 ETH
    
        // ---------
        // Act: Sponsor (owner) registers names for recipients via batch
        // ---------
        await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
    
        // ---------
        // Assert: Verify DETH is credited to sponsor, not recipients
        // ---------
        // Verify DETH was credited to sponsor (owner)
        const finalDETHBurnedSponsor = await s.deth.burned(s.owner.address);
        expect(finalDETHBurnedSponsor - initialDETHBurnedSponsor).to.equal(expectedDETHAmount);
    
        // Verify DETH was NOT credited to recipient user1 (should remain unchanged)
        const finalDETHBurnedUser1 = await s.deth.burned(s.user1.address);
        expect(finalDETHBurnedUser1 - initialDETHBurnedUser1).to.equal(0n);
    
        // Verify DETH was NOT credited to recipient user2 (should remain unchanged)
        const finalDETHBurnedUser2 = await s.deth.burned(s.user2.address);
        expect(finalDETHBurnedUser2 - initialDETHBurnedUser2).to.equal(0n);
    });

    it("Should allow namespace creator to sponsor batch registrations during exclusive period (30 days)", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // Prepare batch registrations: user2 and owner as recipients (sponsor is user1, the namespace creator)
        const registrations = [
            { label: "alice", recipient: s.user2.address }, // user2 is recipient
            { label: "bob", recipient: s.owner.address }, // owner is recipient
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment
        const totalPayment = pricePerName * BigInt(registrations.length);

        // ---------
        // Act: Namespace creator (user1) sponsors batch registrations during exclusivity period
        // ---------
        const tx = await s.xns.connect(s.user1).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify names were registered correctly
        // ---------
        // Verify return value (should be 2 successful registrations)
        const expectedSuccessfulCount = 2n;
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify name mappings for each registration
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const getName = s.xns.getFunction("getName(address)");

        for (const reg of registrations) {
            const ownerAddress = await getAddressByLabelAndNamespace(reg.label, namespace);
            expect(ownerAddress).to.equal(reg.recipient); // recipient is the owner, not user1 (sponsor)
            expect(ownerAddress).to.not.equal(s.user1.address); // sponsor should not own the name

            const fullName = `${reg.label}.${namespace}`;
            expect(await getName(reg.recipient)).to.equal(fullName);
        }
    });

    it("Should allow anyone to sponsor batch registrations after exclusive period (30 days)", async () => {
        // ---------
        // Arrange: Prepare parameters and fast-forward past exclusivity period
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify we're past the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.gte(Number(createdAt) + Number(exclusivityPeriod));

        // Prepare batch registrations: user2 and owner as recipients (sponsor is owner, not namespace creator)
        const registrations = [
            { label: "alice", recipient: s.user2.address }, // user2 is recipient
            { label: "bob", recipient: s.user1.address }, // user1 is recipient (but also namespace creator)
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment
        const totalPayment = pricePerName * BigInt(registrations.length);

        // Note: We'll use owner (not namespace creator) as the sponsor to verify anyone can sponsor
        // ---------
        // Act: Non-creator (owner) sponsors batch registrations after exclusivity period
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify names were registered correctly
        // ---------
        // Verify return value (should be 2 successful registrations)
        const expectedSuccessfulCount = 2n;
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify name mappings for each registration
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const getName = s.xns.getFunction("getName(address)");

        for (const reg of registrations) {
            const ownerAddress = await getAddressByLabelAndNamespace(reg.label, namespace);
            expect(ownerAddress).to.equal(reg.recipient); // recipient is the owner, not owner (sponsor)
            expect(ownerAddress).to.not.equal(s.owner.address); // sponsor should not own the name

            const fullName = `${reg.label}.${namespace}`;
            expect(await getName(reg.recipient)).to.equal(fullName);
        }
    });

    it("Should allow sponsoring name registrations including an EIP-1271 contract wallet recipient.", async () => {
        // ---------
        // Arrange: Prepare parameters (EIP-1271 wallet is already deployed in setup)
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get wallet address from setup
        const walletAddress = await s.eip1271Wallet.getAddress();

        // Verify wallet owner is user2
        expect(await s.eip1271Wallet.owner()).to.equal(s.user2.address);

        // Prepare batch registrations: EIP-1271 wallet and EOA (user1) as recipients
        // This tests that EIP-1271 signatures work correctly in a batch with mixed recipients
        const registrations = [
            { label: "wallet1", recipient: walletAddress, signer: s.user2 }, // EIP-1271 wallet is recipient, signed by owner (user2)
            { label: "eoa1", recipient: s.user1.address, signer: s.user1 }, // EOA recipient, signed by themselves
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // For EIP-1271 wallet, the signature is created by the wallet owner (user2)
            // The signature will be validated by the wallet's isValidSignature function
            // For EOA, the signature is created by the recipient themselves
            const signature = await s.signRegisterNameAuth(
                (reg as any).signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment
        const totalPayment = pricePerName * BigInt(registrations.length);

        // ---------
        // Act: Sponsor batch registrations for EIP-1271 contract wallet recipient
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify names were registered correctly to the contract wallet
        // ---------
        // Verify return value (should be 2 successful registrations)
        const expectedSuccessfulCount = 2n;
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify name mappings for each registration
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const getName = s.xns.getFunction("getName(address)");

        // Verify name mappings for each registration
        for (const reg of registrations) {
            const ownerAddress = await getAddressByLabelAndNamespace(reg.label, namespace);
            expect(ownerAddress).to.equal(reg.recipient); // recipient is the owner, not owner (sponsor)
            expect(ownerAddress).to.not.equal(s.owner.address); // sponsor should not own the name

            const fullName = `${reg.label}.${namespace}`;
            expect(await getName(reg.recipient)).to.equal(fullName);
        }

        // Specifically verify EIP-1271 wallet registration
        const walletOwnerAddress = await getAddressByLabelAndNamespace(registrations[0].label, namespace);
        expect(walletOwnerAddress).to.equal(walletAddress);
        expect(await getName(walletAddress)).to.equal(`${registrations[0].label}.${namespace}`);

        // Verify EOA registration
        const eoaOwnerAddress = await getAddressByLabelAndNamespace(registrations[1].label, namespace);
        expect(eoaOwnerAddress).to.equal(s.user1.address);
        expect(await getName(s.user1.address)).to.equal(`${registrations[1].label}.${namespace}`);
    });

    it("Should permit anyone (non-namespace-creator) to register multiple names in the special \"x\" namespace (100 ETH) after the exclusive period ends", async () => {
        // ---------
        // Arrange: Prepare parameters for special namespace "x"
        // ---------
        const namespace = "x"; // Special namespace
        const specialNamespacePrice = await s.xns.SPECIAL_NAMESPACE_PRICE(); // 100 ETH
        const pricePerName = specialNamespacePrice;

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify we're past the exclusivity period
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.owner.address); // owner is the namespace creator for "x"

        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.gte(Number(createdAt) + Number(exclusivityPeriod));

        // Prepare batch registrations: user1 and user2 as recipients (sponsor is owner, but owner is also namespace creator)
        // To test non-creator, we'll use user1 as sponsor (not namespace creator)
        const registrations = [
            { label: "alice", recipient: s.user1.address }, // user1 is recipient
            { label: "bob", recipient: s.user2.address }, // user2 is recipient
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment (2 * 100 ETH = 200 ETH)
        const totalPayment = pricePerName * BigInt(registrations.length);

        // Note: We'll use user1 (not namespace creator) as the sponsor to verify anyone can sponsor
        // ---------
        // Act: Non-creator (user1) sponsors batch registrations in special "x" namespace after exclusivity period
        // ---------
        const tx = await s.xns.connect(s.user1).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify names were registered correctly
        // ---------
        // Verify return value (should be 2 successful registrations)
        const expectedSuccessfulCount = 2n;
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(Number(expectedSuccessfulCount));

        // Verify name mappings for each registration
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const getName = s.xns.getFunction("getName(address)");

        for (const reg of registrations) {
            const ownerAddress = await getAddressByLabelAndNamespace(reg.label, namespace);
            expect(ownerAddress).to.equal(reg.recipient); // recipient is the owner, not sponsor (unless sponsor is also recipient)

            const fullName = `${reg.label}`;
            expect(await getName(reg.recipient)).to.equal(fullName);
        }

        // Verify that names are registered to recipients, not sponsor (except where sponsor is also recipient)
        const ownerAddress1 = await getAddressByLabelAndNamespace(registrations[0].label, namespace);
        const ownerAddress2 = await getAddressByLabelAndNamespace(registrations[1].label, namespace);
        expect(ownerAddress1).to.equal(s.user1.address); // user1 is recipient for first registration
        expect(ownerAddress2).to.equal(s.user2.address); // user2 is recipient for second registration
        expect(ownerAddress2).to.not.equal(s.user1.address); // sponsor (user1) should not own user2's name

        // Verify that the special namespace price (100 ETH) was used
        // This is implicitly verified by the successful transaction with totalPayment = 2 * 100 ETH
        expect(totalPayment).to.equal(specialNamespacePrice * 2n);
    });

    it("Should emit `NameRegistered` event for each successful registration", async () => {
        // ---------
        // Arrange: Prepare parameters for batch registration
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch registrations: user1, user2, and owner as recipients
        const registrations = [
            { label: "alice", recipient: s.user1.address },
            { label: "bob", recipient: s.user2.address },
            { label: "charlie", recipient: s.owner.address },
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment
        const totalPayment = pricePerName * BigInt(registrations.length);

        // ---------
        // Act: Sponsor batch registrations
        // ---------
        const tx = await s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify `NameRegistered` events were emitted for each successful registration
        // ---------
        const eventFilter = s.xns.filters.NameRegistered();
        const events = await s.xns.queryFilter(eventFilter, receipt!.blockNumber, receipt!.blockNumber);

        // Verify correct number of events (should be 3, one for each successful registration)
        expect(events.length).to.equal(registrations.length);

        // Verify each registration has a corresponding event
        // Note: Events have indexed label and namespace (stored as bytes32 hashes in topics)
        for (const reg of registrations) {
            const expectedLabelHash = ethers.keccak256(ethers.toUtf8Bytes(reg.label));
            const expectedNamespaceHash = ethers.keccak256(ethers.toUtf8Bytes(namespace));
            
            const matchingEvent = events.find((event: any) => {
                // Check if the event's label hash, namespace hash, and owner all match
                return event.args && 
                    event.args.owner && 
                    event.args.owner.toLowerCase() === reg.recipient.toLowerCase() &&
                    event.topics && 
                    event.topics[1] === expectedLabelHash && // topics[0] is the event signature, topics[1] is first indexed param
                    event.topics[2] === expectedNamespaceHash; // topics[2] is second indexed param
            });
            expect(matchingEvent).to.not.be.undefined;
            expect(matchingEvent!.args!.owner).to.equal(reg.recipient);
            
            // Verify the indexed parameters (label and namespace hashes)
            expect(matchingEvent!.topics[1]).to.equal(expectedLabelHash);
            expect(matchingEvent!.topics[2]).to.equal(expectedNamespaceHash);
        }

    });

    it("Should revert with `XNS: length mismatch` error when arrays have different lengths", async () => {
        // ---------
        // Arrange: Prepare parameters with mismatched array lengths
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare registrations array with 2 items
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice",
                namespace: namespace,
            },
            {
                recipient: s.user2.address,
                label: "bob",
                namespace: namespace,
            },
        ];

        // Create signatures for only 1 item (mismatch: 2 registrations but only 1 signature)
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", namespace),
        ];

        // Calculate payment for 2 registrations (even though it will revert)
        const totalPayment = pricePerName * BigInt(registerNameAuths.length);

        // ---------
        // Act & Assert: Should revert with length mismatch error
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: length mismatch");
    });

    it("Should revert with `XNS: empty array` error when arrays are empty", async () => {
        // ---------
        // Arrange: Prepare empty arrays
        // ---------
        const registerNameAuths: any[] = [];
        const signatures: any[] = [];

        // ---------
        // Act & Assert: Should revert with empty array error
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: 0 }
            )
        ).to.be.revertedWith("XNS: empty array");
    });

    it("Should revert with `XNS: namespace not found` error for non-existent namespace", async () => {
        // ---------
        // Arrange: Prepare parameters with non-existent namespace
        // ---------
        const nonExistentNamespace = "nex";
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare registration with non-existent namespace
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice",
                namespace: nonExistentNamespace,
            },
        ];

        // Create signature for the registration
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", nonExistentNamespace),
        ];

        // Calculate payment (even though it will revert)
        const totalPayment = pricePerName;

        // ---------
        // Act & Assert: Should revert with namespace not found error
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: namespace not found");
    });

    it("Should revert with `XNS: insufficient payment` error when `msg.value` is less than `pricePerName * successfulCount`", async () => {
        // ---------
        // Arrange: Prepare batch registration with insufficient payment
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch with 2 registrations
        const registrations = [
            { label: "alice", recipient: s.user1.address },
            { label: "bob", recipient: s.user2.address },
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user1.address) {
                signer = s.user1;
            } else if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Pay only for 1 registration, but we're attempting 2 (insufficient payment)
        const insufficientPayment = pricePerName; // Only enough for 1 registration

        // ---------
        // Act & Assert: Should revert with insufficient payment error
        // The contract will process both registrations successfully, then check payment
        // and revert because msg.value < pricePerName * successfulCount (2)
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: insufficientPayment }
            )
        ).to.be.revertedWith("XNS: insufficient payment");
    });

    it("Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor during exclusive period", async () => {
        // ---------
        // Arrange: Prepare batch registration during exclusivity period with non-creator sponsor
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");

        // Verify we're within the exclusivity period (don't fast-forward)
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, createdAt] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator

        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        expect(now).to.be.lt(Number(createdAt) + Number(exclusivityPeriod));

        // Prepare batch registrations
        const registrations = [
            { label: "alice", recipient: s.user2.address },
            { label: "bob", recipient: s.owner.address },
        ];

        // Create signatures for all recipients
        const registerNameAuths = [];
        const signatures = [];
        for (const reg of registrations) {
            // Get the signer for each recipient
            let signer: SignerWithAddress;
            if (reg.recipient === s.user2.address) {
                signer = s.user2;
            } else if (reg.recipient === s.owner.address) {
                signer = s.owner;
            } else {
                throw new Error(`Unknown recipient: ${reg.recipient}`);
            }
            
            const signature = await s.signRegisterNameAuth(
                signer,
                reg.recipient,
                reg.label,
                namespace
            );
            registerNameAuths.push({
                recipient: reg.recipient,
                label: reg.label,
                namespace: namespace,
            });
            signatures.push(signature);
        }

        // Calculate total payment needed
        const totalPayment = pricePerName * BigInt(registrations.length);

        // ---------
        // Act & Assert: Should revert with not namespace creator error
        // owner (non-creator) tries to sponsor during exclusivity period
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: not namespace creator");
    });

    it("Should revert with `XNS: namespace mismatch` error when registrations are in different namespaces", async () => {
        // ---------
        // Arrange: Prepare batch registration with different namespaces
        // ---------
        const namespace1 = "xns"; // Already registered in setup
        const namespace2 = "nm2"; // Need to register this namespace
        const pricePerName1 = ethers.parseEther("0.001");
        const pricePerName2 = ethers.parseEther("0.002");

        // Register second namespace
        const namespaceFee = await s.xns.NAMESPACE_REGISTRATION_FEE();
        await s.xns.connect(s.user2).registerNamespace(namespace2, pricePerName2, { value: namespaceFee });

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch with registrations in different namespaces
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice",
                namespace: namespace1, // First namespace
            },
            {
                recipient: s.user2.address,
                label: "bob",
                namespace: namespace2, // Different namespace - will cause mismatch
            },
        ];

        // Create signatures for both registrations
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", namespace1),
            await s.signRegisterNameAuth(s.user2, s.user2.address, "bob", namespace2),
        ];

        // Calculate payment (even though it will revert)
        const totalPayment = pricePerName1 + pricePerName2;

        // ---------
        // Act & Assert: Should revert with namespace mismatch error
        // The contract checks that all namespaces match the first one in the loop
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: namespace mismatch");
    });

    it("Should revert with `XNS: invalid label` error for invalid label in any registration", async () => {
        // ---------
        // Arrange: Prepare batch registration with invalid label in one registration
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch with one valid label and one invalid label
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice", // Valid label
                namespace: namespace,
            },
            {
                recipient: s.user2.address,
                label: "InvalidLabel", // Invalid label (contains uppercase)
                namespace: namespace,
            },
        ];

        // Create signatures for both registrations
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", namespace),
            await s.signRegisterNameAuth(s.user2, s.user2.address, "InvalidLabel", namespace),
        ];

        // Calculate payment (even though it will revert)
        const totalPayment = pricePerName * BigInt(registerNameAuths.length);

        // ---------
        // Act & Assert: Should revert with invalid label error
        // The contract validates labels in the loop and will revert on the invalid one
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: invalid label");
    });

    it("Should revert with `XNS: 0x recipient` error when any recipient is address(0)", async () => {
        // ---------
        // Arrange: Prepare batch registration with zero address recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch with one valid recipient and one zero address recipient
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice", // Valid recipient
                namespace: namespace,
            },
            {
                recipient: ethers.ZeroAddress, // Zero address - will cause revert
                label: "bob",
                namespace: namespace,
            },
        ];

        // Create signatures for both registrations
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", namespace),
            await s.signRegisterNameAuth(s.user2, ethers.ZeroAddress, "bob", namespace), // Signature for zero address
        ];

        // Calculate payment (even though it will revert)
        const totalPayment = pricePerName * BigInt(registerNameAuths.length);

        // ---------
        // Act & Assert: Should revert with 0x recipient error
        // The contract validates recipients in the loop and will revert on the zero address
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: 0x recipient");
    });

    it("Should revert with `XNS: bad authorization` error for invalid signature in any registration", async () => {
        // ---------
        // Arrange: Prepare batch registration with invalid signature in one registration
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch with two valid registrations
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice",
                namespace: namespace,
            },
            {
                recipient: s.user2.address,
                label: "bob",
                namespace: namespace,
            },
        ];

        // Create one valid signature and one invalid signature (random bytes)
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", namespace), // Valid signature
            ethers.randomBytes(65), // Invalid signature (random bytes)
        ];

        // Calculate payment (even though it will revert)
        const totalPayment = pricePerName * BigInt(registerNameAuths.length);

        // ---------
        // Act & Assert: Should revert with bad authorization error
        // The contract validates signatures in the loop and will revert on the invalid one
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: bad authorization");
    });

    it("Should revert with `XNS: bad authorization` error when any signature is from wrong recipient", async () => {
        // ---------
        // Arrange: Prepare batch registration with signature from wrong recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Prepare batch with two registrations
        const registerNameAuths = [
            {
                recipient: s.user1.address,
                label: "alice",
                namespace: namespace,
            },
            {
                recipient: s.user2.address, // Recipient is user2
                label: "bob",
                namespace: namespace,
            },
        ];

        // Create one valid signature and one signature from wrong recipient (user1 signs for user2)
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "alice", namespace), // Valid: user1 signs for user1
            await s.signRegisterNameAuth(s.user1, s.user2.address, "bob", namespace), // Invalid: user1 signs for user2
        ];

        // Calculate payment (even though it will revert)
        const totalPayment = pricePerName * BigInt(registerNameAuths.length);

        // ---------
        // Act & Assert: Should revert with bad authorization error
        // The contract validates that signatures are from the correct recipient
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: bad authorization");
    });

    it("Should revert with `XNS: refund failed` error if refund fails when no registrations succeed", async () => {
        // ---------
        // Arrange: Prepare batch registration where all registrations will be skipped, and sender reverts on receive
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can sponsor
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Deploy RevertingReceiver contract that will revert when receiving ETH
        const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
        const revertingReceiver = await RevertingReceiver.deploy();
        await revertingReceiver.waitForDeployment();
        const revertingReceiverAddress = await revertingReceiver.getAddress();

        // First, register names for both recipients so they already have names
        // This ensures all registrations in the batch will be skipped
        await s.xns.connect(s.user1).registerName("alice", namespace, { value: pricePerName });
        await s.xns.connect(s.user2).registerName("bob", namespace, { value: pricePerName });

        // Prepare batch with registrations for recipients who already have names
        const registerNameAuths = [
            {
                recipient: s.user1.address, // Already has a name
                label: "charlie",
                namespace: namespace,
            },
            {
                recipient: s.user2.address, // Already has a name
                label: "david",
                namespace: namespace,
            },
        ];

        // Create signatures (they won't be validated since registrations will be skipped)
        const signatures = [
            await s.signRegisterNameAuth(s.user1, s.user1.address, "charlie", namespace),
            await s.signRegisterNameAuth(s.user2, s.user2.address, "david", namespace),
        ];

        // Calculate payment
        const totalPayment = pricePerName * BigInt(registerNameAuths.length);

        // Fund the revertingReceiver with ETH to pay for the transaction and gas costs
        const balanceNeeded = totalPayment + ethers.parseEther("0.02"); // Extra ETH for gas
        await ethers.provider.send("hardhat_setBalance", [
            revertingReceiverAddress,
            "0x" + balanceNeeded.toString(16),
        ]);

        // Impersonate the revertingReceiver to send the transaction
        await impersonateAccount(revertingReceiverAddress);
        const revertingReceiverSigner = await ethers.getSigner(revertingReceiverAddress);

        // ---------
        // Act & Assert: Should revert with refund failed error
        // All registrations will be skipped (recipients already have names),
        // so successful = 0, and the contract will try to refund to revertingReceiver
        // which will revert, causing "XNS: refund failed" error
        // ---------
        await expect(
            s.xns.connect(revertingReceiverSigner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: refund failed");
    });

  });

  describe("claimFees", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    it("Should allow owner to claim all pending fees for `msg.sender` and transfer to recipient (non-owner)", async () => {
        // ---------
        // Arrange: Accumulate fees for owner and prepare recipient
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");
        const recipient = s.user1.address; // Non-owner recipient

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the owner (5% of pricePerName)
        // Owner gets 5% of each registration fee
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for owner
        const expectedFees = await s.xns.getPendingFees(s.owner.address);
        expect(expectedFees).to.be.gt(0); // Verify fees were accumulated

        // Get initial balance of recipient
        const recipientInitialBalance = await ethers.provider.getBalance(recipient);

        // ---------
        // Act: Owner claims fees and transfers to recipient
        // ---------
        const tx = await s.xns.connect(s.owner).claimFees(recipient);
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify correct amount transferred and fees reset
        // ---------
        // Verify recipient received the correct amount
        const recipientFinalBalance = await ethers.provider.getBalance(recipient);
        const receivedAmount = recipientFinalBalance - recipientInitialBalance;
        expect(receivedAmount).to.equal(expectedFees);

        // Verify pending fees are reset to zero
        const pendingFeesAfter = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFeesAfter).to.equal(0);
    });

    it("Should allow namespace creator to claim all pending fees for `msg.sender` and transfer to recipient (non-namespace-creator)", async () => {
        // ---------
        // Arrange: Accumulate fees for namespace creator and prepare recipient
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");
        const recipient = s.user2.address; // Non-namespace-creator recipient

        // Verify user1 is the namespace creator
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address);

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the namespace creator (5% of pricePerName)
        // Namespace creator gets 5% of each registration fee in their namespace
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for namespace creator (user1)
        const expectedFees = await s.xns.getPendingFees(s.user1.address);
        expect(expectedFees).to.be.gt(0); // Verify fees were accumulated

        // Get initial balance of recipient
        const recipientInitialBalance = await ethers.provider.getBalance(recipient);

        // ---------
        // Act: Namespace creator claims fees and transfers to recipient
        // ---------
        const tx = await s.xns.connect(s.user1).claimFees(recipient);
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify correct amount transferred and fees reset
        // ---------
        // Verify recipient received the correct amount
        const recipientFinalBalance = await ethers.provider.getBalance(recipient);
        const receivedAmount = recipientFinalBalance - recipientInitialBalance;
        expect(receivedAmount).to.equal(expectedFees);

        // Verify pending fees are reset to zero
        const pendingFeesAfter = await s.xns.getPendingFees(s.user1.address);
        expect(pendingFeesAfter).to.equal(0);
    });

    it("Should allow owner to claim all pending fees to themselves", async () => {
        // ---------
        // Arrange: Accumulate fees for owner
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the owner (5% of pricePerName)
        // Owner gets 5% of each registration fee
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for owner
        const expectedFees = await s.xns.getPendingFees(s.owner.address);
        expect(expectedFees).to.be.gt(0); // Verify fees were accumulated

        // Get initial balance of owner
        const ownerInitialBalance = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Owner claims fees to themselves using claimFees with owner as recipient
        // ---------
        const tx = await s.xns.connect(s.owner).claimFees(s.owner.address);
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

        // ---------
        // Assert: Verify correct amount transferred and fees reset
        // ---------
        // Verify owner received the correct amount (accounting for gas costs)
        const ownerFinalBalance = await ethers.provider.getBalance(s.owner.address);
        const receivedAmount = ownerFinalBalance - ownerInitialBalance + gasUsed;
        expect(receivedAmount).to.equal(expectedFees);

        // Verify pending fees are reset to zero
        const pendingFeesAfter = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFeesAfter).to.equal(0);
    });

    it("Should allow namespace creator to claim all pending fees to themselves", async () => {
        // ---------
        // Arrange: Accumulate fees for namespace creator
        // ---------
        const namespace = "xns"; // Already registered in setup by user1
        const pricePerName = ethers.parseEther("0.001");

        // Verify user1 is the namespace creator
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address);

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the namespace creator (5% of pricePerName)
        // Namespace creator gets 5% of each registration fee in their namespace
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for namespace creator (user1)
        const expectedFees = await s.xns.getPendingFees(s.user1.address);
        expect(expectedFees).to.be.gt(0); // Verify fees were accumulated

        // Get initial balance of namespace creator
        const creatorInitialBalance = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Namespace creator claims fees to themselves using claimFees with creator as recipient
        // ---------
        const tx = await s.xns.connect(s.user1).claimFees(s.user1.address);
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

        // ---------
        // Assert: Verify correct amount transferred and fees reset
        // ---------
        // Verify namespace creator received the correct amount (accounting for gas costs)
        const creatorFinalBalance = await ethers.provider.getBalance(s.user1.address);
        const receivedAmount = creatorFinalBalance - creatorInitialBalance + gasUsed;
        expect(receivedAmount).to.equal(expectedFees);

        // Verify pending fees are reset to zero
        const pendingFeesAfter = await s.xns.getPendingFees(s.user1.address);
        expect(pendingFeesAfter).to.equal(0);
    });

    it("Should allow claiming fees multiple times as they accumulate", async () => {
        // ---------
        // Arrange: Reset fees and accumulate fees over multiple registrations
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Reset fees by claiming any existing fees from namespace registration in setup
        const initialPendingFees = await s.xns.getPendingFees(s.owner.address);
        if (initialPendingFees > 0) {
            await s.xns.connect(s.owner).claimFees(s.owner.address);
        }
        // Verify fees are reset to zero
        const feesAfterReset = await s.xns.getPendingFees(s.owner.address);
        expect(feesAfterReset).to.equal(0);

        // Get additional signers for multiple registrations (each address can only register one name)
        const signers = await ethers.getSigners();
        const user3 = signers[3];
        const user4 = signers[4];
        const user5 = signers[5];

        // Register first name to accumulate fees for owner (5% of pricePerName)
        await s.xns.connect(user3).registerName("alice", namespace, { value: pricePerName });

        // Get initial pending fees for owner (should only be from this registration)
        const firstFees = await s.xns.getPendingFees(s.owner.address);
        expect(firstFees).to.be.gt(0);

        // Get initial balance of owner
        const ownerInitialBalance = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Claim fees first time
        // ---------
        const tx1 = await s.xns.connect(s.owner).claimFees(s.owner.address);
        const receipt1 = await tx1.wait();
        const gasUsed1 = receipt1!.gasUsed * receipt1!.gasPrice;

        // ---------
        // Assert: Verify first claim
        // ---------
        const ownerBalanceAfterFirst = await ethers.provider.getBalance(s.owner.address);
        const receivedAmount1 = ownerBalanceAfterFirst - ownerInitialBalance + gasUsed1;
        expect(receivedAmount1).to.equal(firstFees);

        // Verify pending fees are reset to zero after first claim
        const pendingFeesAfterFirst = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFeesAfterFirst).to.equal(0);

        // ---------
        // Arrange: Accumulate more fees with additional registrations
        // ---------
        // Register second name with different user to accumulate more fees
        await s.xns.connect(user4).registerName("bob", namespace, { value: pricePerName });

        // Register third name with different user to accumulate even more fees
        await s.xns.connect(user5).registerName("charlie", namespace, { value: pricePerName });

        // Get new pending fees (should be 2 * firstFees since we registered 2 more names)
        const secondFees = await s.xns.getPendingFees(s.owner.address);
        expect(secondFees).to.equal(firstFees * 2n); // 2 registrations = 2x fees

        // Get balance before second claim
        const ownerBalanceBeforeSecond = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Claim fees second time
        // ---------
        const tx2 = await s.xns.connect(s.owner).claimFees(s.owner.address);
        const receipt2 = await tx2.wait();
        const gasUsed2 = receipt2!.gasUsed * receipt2!.gasPrice;

        // ---------
        // Assert: Verify second claim
        // ---------
        const ownerBalanceAfterSecond = await ethers.provider.getBalance(s.owner.address);
        const receivedAmount2 = ownerBalanceAfterSecond - ownerBalanceBeforeSecond + gasUsed2;
        expect(receivedAmount2).to.equal(secondFees);

        // Verify pending fees are reset to zero after second claim
        const pendingFeesAfterSecond = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFeesAfterSecond).to.equal(0);

        // Verify total fees claimed equals sum of all accumulated fees
        const totalReceived = receivedAmount1 + receivedAmount2;
        const expectedTotal = firstFees + secondFees;
        expect(totalReceived).to.equal(expectedTotal);
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `FeesClaimed` event with correct recipient and amount", async () => {
        // ---------
        // Arrange: Accumulate fees for owner
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the owner (5% of pricePerName)
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for owner
        const expectedFees = await s.xns.getPendingFees(s.owner.address);
        expect(expectedFees).to.be.gt(0);

        // ---------
        // Act: Owner claims fees to a recipient
        // ---------
        const recipient = s.user1.address;
        const tx = await s.xns.connect(s.owner).claimFees(recipient);
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify FeesClaimed event was emitted with correct parameters
        // ---------
        const events = await s.xns.queryFilter(s.xns.filters.FeesClaimed(), receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(1);
        expect(events[0].args.recipient).to.equal(recipient);
        expect(events[0].args.amount).to.equal(expectedFees);
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should revert with `XNS: zero recipient` error when recipient is address(0)", async () => {
        // ---------
        // Arrange: Accumulate fees for owner
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the owner
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Verify owner has pending fees
        const pendingFees = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFees).to.be.gt(0);

        // ---------
        // Act & Assert: Attempt to claim fees to zero address
        // ---------
        await expect(
            s.xns.connect(s.owner).claimFees(ethers.ZeroAddress)
        ).to.be.revertedWith("XNS: zero recipient");
    });

    it("Should revert with `XNS: no fees to claim` error when caller has no pending fees", async () => {
        // ---------
        // Arrange: Ensure caller has no pending fees
        // ---------
        // Verify user2 has no pending fees
        const pendingFees = await s.xns.getPendingFees(s.user2.address);
        expect(pendingFees).to.equal(0);

        // ---------
        // Act & Assert: Attempt to claim fees when there are none
        // ---------
        await expect(
            s.xns.connect(s.user2).claimFees(s.user2.address)
        ).to.be.revertedWith("XNS: no fees to claim");
    });

    it("Should revert with `XNS: fee transfer failed` error when transfer fails", async () => {
        // ---------
        // Arrange: Accumulate fees and deploy RevertingReceiver
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register a name to accumulate fees for the owner
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Verify owner has pending fees
        const pendingFees = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFees).to.be.gt(0);

        // Deploy RevertingReceiver contract that will revert when receiving ETH
        const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
        const revertingReceiver = await RevertingReceiver.deploy();
        await revertingReceiver.waitForDeployment();

        // ---------
        // Act & Assert: Attempt to claim fees to RevertingReceiver
        // ---------
        await expect(
            s.xns.connect(s.owner).claimFees(await revertingReceiver.getAddress())
        ).to.be.revertedWith("XNS: fee transfer failed");
    });

  });
});

