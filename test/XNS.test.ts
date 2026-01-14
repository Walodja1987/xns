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
        { name: "label", type: "string" },
        { name: "namespace", type: "string" },
      ],
    };

    const value = {
      recipient: recipient,
      label: label,
      namespace: namespace,
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
    const namespaceFee = await xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
    await xns.connect(user1).registerPublicNamespace(testNamespace, testNamespacePricePerName, { value: namespaceFee });

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
        const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfoByString("x");

        // Should register special namespace "x" with correct price (100 ETH)
        expect(pricePerName).to.equal(ethers.parseEther("100"));

        // Should set special namespace creator to owner
        expect(creator).to.equal(s.owner.address);

        // Should set special namespace createdAt to deployment timestamp
        expect(createdAt).to.equal(s.deploymentBlockTimestamp);

        // Should set special namespace as public (isPrivate = false)
        expect(isPrivate).to.equal(false);

        // Should register bare name "xns" for the XNS contract itself
        const contractAddress = await s.xns.getAddress();
        expect(await s.xns.getAddress("xns")).to.equal(contractAddress);
        expect(await s.xns.getAddress("xns", "x")).to.equal(contractAddress);
        expect(await s.xns.getName(contractAddress)).to.equal("xns");
    });

    it("Should have correct constants", async () => {
        // Should have correct PUBLIC_NAMESPACE_REGISTRATION_FEE (200 ether)
        expect(await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE()).to.equal(ethers.parseEther("200"));

        // Should have correct PRIVATE_NAMESPACE_REGISTRATION_FEE (10 ether)
        expect(await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE()).to.equal(ethers.parseEther("10"));

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
            .withArgs("x", ethers.parseEther("100"), s.owner.address, false);
    });

    it("Should emit `NameRegistered` event for contract's own name 'xns'", async () => {
        const contractAddress = await s.xns.getAddress();
        await expect(s.xns.deploymentTransaction())
            .to.emit(s.xns, "NameRegistered")
            .withArgs("xns", "x", contractAddress);
    });

    it("Should revert with `XNS: 0x owner` error when owner is `address(0)`", async () => {
        // ---------
        // Act & Assert: Attempt to deploy contract with zero address as owner
        // ---------
        await expect(
            ethers.deployContract("XNS", [ethers.ZeroAddress])
        ).to.be.revertedWith("XNS: 0x owner");
    });

    
  });

  describe("isValidSlug", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return `true` for valid labels with lowercase letters", async () => {
        expect(await s.xns.isValidSlug("alice")).to.be.true;
        expect(await s.xns.isValidSlug("bob")).to.be.true;
        expect(await s.xns.isValidSlug("charlie")).to.be.true;
    });

    it("Should return `true` for valid labels with digits", async () => {
        expect(await s.xns.isValidSlug("123")).to.be.true;
        expect(await s.xns.isValidSlug("0")).to.be.true;
        expect(await s.xns.isValidSlug("999")).to.be.true;
    });

    it("Should return `true` for valid labels with hyphens", async () => {
        expect(await s.xns.isValidSlug("alice-bob")).to.be.true;
        expect(await s.xns.isValidSlug("test-label")).to.be.true;
        expect(await s.xns.isValidSlug("my-name")).to.be.true;
    });

    it("Should return `true` for valid labels combining letters, digits, and hyphens", async () => {
        expect(await s.xns.isValidSlug("alice123")).to.be.true;
        expect(await s.xns.isValidSlug("test-123")).to.be.true;
        expect(await s.xns.isValidSlug("user-42-name")).to.be.true;
        expect(await s.xns.isValidSlug("abc-123-def")).to.be.true;
    });

    it("Should return `true` for minimum length (1 character)", async () => {
        expect(await s.xns.isValidSlug("a")).to.be.true;
        expect(await s.xns.isValidSlug("1")).to.be.true;
        expect(await s.xns.isValidSlug("x")).to.be.true;
    });

    it("Should return `true` for maximum length (20 characters)", async () => {
        expect(await s.xns.isValidSlug("a".repeat(20))).to.be.true;
        expect(await s.xns.isValidSlug("1".repeat(20))).to.be.true;
        expect(await s.xns.isValidSlug("abcdefghijklmnopqrst")).to.be.true;
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should return `false` for empty string", async () => {
        expect(await s.xns.isValidSlug("")).to.be.false;
    });

    it("Should return `false` for labels longer than 20 characters", async () => {
        expect(await s.xns.isValidSlug("a".repeat(21))).to.be.false;
        expect(await s.xns.isValidSlug("abcdefghijklmnopqrstu")).to.be.false;
        expect(await s.xns.isValidSlug("verylonglabelname12345")).to.be.false;
    });

    it("Should return `false` for labels starting with hyphen", async () => {
        expect(await s.xns.isValidSlug("-alice")).to.be.false;
        expect(await s.xns.isValidSlug("-test")).to.be.false;
        expect(await s.xns.isValidSlug("-123")).to.be.false;
    });

    it("Should return `false` for labels ending with hyphen", async () => {
        expect(await s.xns.isValidSlug("alice-")).to.be.false;
        expect(await s.xns.isValidSlug("test-")).to.be.false;
        expect(await s.xns.isValidSlug("123-")).to.be.false;
    });

    it("Should return `false` for labels containing uppercase letters", async () => {
        expect(await s.xns.isValidSlug("Alice")).to.be.false;
        expect(await s.xns.isValidSlug("TEST")).to.be.false;
        expect(await s.xns.isValidSlug("aliceBob")).to.be.false;
        expect(await s.xns.isValidSlug("test-Label")).to.be.false;
    });

    it("Should return `false` for labels containing spaces", async () => {
        expect(await s.xns.isValidSlug("alice bob")).to.be.false;
        expect(await s.xns.isValidSlug("test label")).to.be.false;
        expect(await s.xns.isValidSlug(" alice")).to.be.false;
        expect(await s.xns.isValidSlug("alice ")).to.be.false;
    });

    it("Should return `false` for labels containing special characters (except hyphen)", async () => {
        expect(await s.xns.isValidSlug("alice@bob")).to.be.false;
        expect(await s.xns.isValidSlug("test#label")).to.be.false;
        expect(await s.xns.isValidSlug("user$name")).to.be.false;
        expect(await s.xns.isValidSlug("test.label")).to.be.false;
        expect(await s.xns.isValidSlug("alice!bob")).to.be.false;
    });

    it("Should return `false` for labels containing underscores", async () => {
        expect(await s.xns.isValidSlug("alice_bob")).to.be.false;
        expect(await s.xns.isValidSlug("test_label")).to.be.false;
        expect(await s.xns.isValidSlug("user_name_123")).to.be.false;
        expect(await s.xns.isValidSlug("xns_deployer")).to.be.false;
    });

    it("Should return `false` for labels containing consecutive hyphens", async () => {
        expect(await s.xns.isValidSlug("alice--bob")).to.be.false;
        expect(await s.xns.isValidSlug("test--label")).to.be.false;
        expect(await s.xns.isValidSlug("my---name")).to.be.false;
        expect(await s.xns.isValidSlug("a--b")).to.be.false;
    });

    
  });



  describe("registerPublicNamespace", function () {
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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act: Register namespace with user1 (not owner as they can register namespaces for free in the first year)
        // ---------
        const tx = await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace info by namespace string
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Should create namespace with correct price
        expect(returnedPrice).to.equal(pricePerName);

        // Should set namespace creator to `msg.sender` (user1 in this case)
        expect(creator).to.equal(s.user1.address);

        // Should set createdAt timestamp
        expect(returnedCreatedAt).to.equal(createdAt);

        // Should set isPrivate to false for public namespace
        expect(isPrivate).to.equal(false);
    });

    it("Should allow multiple public namespaces with the same price (no price uniqueness)", async () => {
        // ---------
        // Arrange: Prepare parameters for two different namespaces with the same price
        // ---------
        const namespace1 = "ns1";
        const namespace2 = "ns2";
        const pricePerName = ethers.parseEther("0.002"); // Same price for both
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act: Register first namespace
        // ---------
        const tx1 = await s.xns.connect(s.user1).registerPublicNamespace(namespace1, pricePerName, { value: fee });
        const receipt1 = await tx1.wait();
        const block1 = await ethers.provider.getBlock(receipt1!.blockNumber);
        const createdAt1 = block1!.timestamp;

        // ---------
        // Act: Register second namespace with the same price (should succeed)
        // ---------
        const tx2 = await s.xns.connect(s.user2).registerPublicNamespace(namespace2, pricePerName, { value: fee });
        const receipt2 = await tx2.wait();
        const block2 = await ethers.provider.getBlock(receipt2!.blockNumber);
        const createdAt2 = block2!.timestamp;

        // ---------
        // Assert: Verify both namespaces were registered correctly
        // ---------
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        
        // Verify first namespace
        const [returnedPrice1, creator1, returnedCreatedAt1, isPrivate1] = await getNamespaceInfoByString(namespace1);
        expect(returnedPrice1).to.equal(pricePerName);
        expect(creator1).to.equal(s.user1.address);
        expect(returnedCreatedAt1).to.equal(createdAt1);
        expect(isPrivate1).to.equal(false);

        // Verify second namespace
        const [returnedPrice2, creator2, returnedCreatedAt2, isPrivate2] = await getNamespaceInfoByString(namespace2);
        expect(returnedPrice2).to.equal(pricePerName);
        expect(creator2).to.equal(s.user2.address);
        expect(returnedCreatedAt2).to.equal(createdAt2);
        expect(isPrivate2).to.equal(false);

        // Verify both namespaces have the same price (no uniqueness check)
        expect(returnedPrice1).to.equal(returnedPrice2);
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
        const tx = await s.xns.connect(s.owner).registerPublicNamespace(namespace, pricePerName, { value: 0 });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(false);


    });

    it("Should require owner to pay fee after 1 year", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "test";
        const pricePerName = ethers.parseEther("0.002");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
        const tx = await s.xns.connect(s.owner).registerPublicNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(false);
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
        const tx = await s.xns.connect(s.owner).registerPublicNamespace(namespace, pricePerName, { value: ethToSend });
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
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(false);

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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act: Non-owner (user1) registers namespace with fee during initial period
        // ---------
        const tx = await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(false);

    });

    it("Should allow anyone (non-owner) to register namespace with fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "nft";
        const pricePerName = ethers.parseEther("0.005");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
        const tx = await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(false);

    });

    it("Should refund excess payment when non-owner pays more than 200 ETH", async () => {
        // ---------
        // Arrange: Prepare parameters with excess payment
        // ---------
        const namespace = "web";
        const pricePerName = ethers.parseEther("0.006");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
        const excessPayment = ethers.parseEther("50"); // Pay 50 ETH more than required
        const totalPayment = fee + excessPayment; // 250 ETH total

        // Get user1 balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Non-owner (user1) registers namespace with excess payment
        // ---------
        const tx = await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: totalPayment });
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
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(false);


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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
        const tx = await s.xns.connect(s.owner).registerPublicNamespace(namespace, pricePerName, { value: totalPayment });
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
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(false);


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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
        
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
        await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee });

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
        const tx = await s.xns.connect(s.owner).registerPublicNamespace(namespace, pricePerName, { value: ethToSend });
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
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(false);


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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
        
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
        await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);


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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
        await s.xns.connect(s.owner).registerPublicNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);


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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
        await s.xns.connect(s.user2).registerPublicNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user2.address);


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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Register namespace and verify event emission
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        )
            .to.emit(s.xns, "NamespaceRegistered")
            .withArgs(namespace, pricePerName, s.user1.address, false);
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
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for namespace longer than 4 characters", async () => {
        // ---------
        // Arrange: Prepare parameters with namespace longer than 4 characters
        // ---------
        const namespace = "abcde"; // 5 characters
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for namespace with invalid characters", async () => {
        // ---------
        // Arrange: Prepare parameters with namespace containing invalid characters
        // ---------
        const namespace = "aBc"; // Contains uppercase letter
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: 'eth' namespace forbidden` error when trying to register \"eth\" namespace", async () => {
        // ---------
        // Arrange: Prepare parameters with "eth" namespace
        // ---------
        const namespace = "eth";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register "eth" namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: 'eth' namespace forbidden");
    });

    it("Should revert with `XNS: pricePerName must be > 0` error for zero price", async () => {
        // ---------
        // Arrange: Prepare parameters with zero price
        // ---------
        const namespace = "zero";
        const pricePerName = 0n;
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace with zero price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: pricePerName must be > 0");
    });

    it("Should revert with `XNS: price must be multiple of 0.001 ETH` error for non-multiple price", async () => {
        // ---------
        // Arrange: Prepare parameters with price that is not a multiple of 0.001 ETH
        // ---------
        const namespace = "mult";
        const pricePerName = ethers.parseEther("0.0015"); // 0.0015 ETH is not a multiple of 0.001 ETH
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register namespace with non-multiple price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: price must be multiple of 0.001 ETH");
    });

    it("Should revert with `XNS: namespace already exists` error when namespace already exists", async () => {
        // ---------
        // Arrange: Register a namespace first
        // ---------
        const namespace = "exst";
        const pricePerName1 = ethers.parseEther("0.015");
        const pricePerName2 = ethers.parseEther("0.016");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

        // Register namespace with first price
        await s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName1, { value: fee });

        // ---------
        // Act & Assert: Attempt to register the same namespace again with different price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerPublicNamespace(namespace, pricePerName2, { value: fee })
        ).to.be.revertedWith("XNS: namespace already exists");
    });

    it("Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters with insufficient fee and verify we're within the initial period
        // ---------
        const namespace = "insf";
        const pricePerName = ethers.parseEther("0.017");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: insufficientFee })
        ).to.be.revertedWith("XNS: insufficient namespace fee");
    });

    it("Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time and prepare parameters with insufficient fee
        // ---------
        const namespace = "ins2";
        const pricePerName = ethers.parseEther("0.018");
        const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
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
            s.xns.connect(s.user1).registerPublicNamespace(namespace, pricePerName, { value: insufficientFee })
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
            xnsWithRevertingOwner.connect(revertingReceiverSigner).registerPublicNamespace(namespace, pricePerName, { value: ethToSend })
        ).to.be.revertedWith("XNS: refund failed");
    });
    
  });

  describe("registerPrivateNamespace", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should register a new private namespace correctly", async () => {
        // ---------
        // Arrange: Prepare parameters for private namespace registration
        // ---------
        const namespace = "my-private-ns";
        const pricePerName = ethers.parseEther("0.002");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act: Register private namespace with user1 (not owner as they can register namespaces for free in the first year)
        // ---------
        const tx = await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify private namespace was registered correctly
        // ---------
        // Retrieve namespace info by namespace string
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Should create namespace with correct price
        expect(returnedPrice).to.equal(pricePerName);

        // Should set namespace creator to `msg.sender` (user1 in this case)
        expect(creator).to.equal(s.user1.address);

        // Should set createdAt timestamp
        expect(returnedCreatedAt).to.equal(createdAt);

        // Should set isPrivate to true for private namespace
        expect(isPrivate).to.equal(true);
    });

    it("Should allow owner to register private namespace without fee (`msg.value = 0`) during initial period (1 year)", async () => {
        // ---------
        // Arrange: Prepare parameters for private namespace registration
        // ---------
        const namespace = "owner-private";
        const pricePerName = ethers.parseEther("0.002");
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act: Owner registers private namespace with msg.value = 0 during initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerPrivateNamespace(namespace, pricePerName, { value: 0 });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify private namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(true);
    });

    it("Should require owner to pay fee after 1 year", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "after-period";
        const pricePerName = ethers.parseEther("0.002");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
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
        // Act: Owner registers private namespace with standard fee
        // ---------
        const tx = await s.xns.connect(s.owner).registerPrivateNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify private namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(true);
    });

    it("Should refund all ETH to owner if owner sends ETH during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "owner-refund";
        const pricePerName = ethers.parseEther("0.003");
        const ethToSend = ethers.parseEther("10"); // Owner sends ETH even though it's free (using PRIVATE_NAMESPACE_REGISTRATION_FEE amount)
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // Get owner balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Owner registers private namespace with ETH during initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerPrivateNamespace(namespace, pricePerName, { value: ethToSend });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get owner balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify private namespace was registered and ETH was refunded
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(true);

        // Verify refund: balance should only decrease by gas costs (not by ethToSend)
        // balanceAfter should equal balanceBefore - gasCost (because ethToSend was refunded)
        const expectedBalanceAfter = balanceBefore - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should allow anyone (non-owner) to register private namespace with fee during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "dao-private";
        const pricePerName = ethers.parseEther("0.004");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act: Non-owner (user1) registers private namespace with fee during initial period
        // ---------
        const tx = await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify private namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(true);
    });

    it("Should allow anyone (non-owner) to register private namespace with fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "nft-private";
        const pricePerName = ethers.parseEther("0.005");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
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
        // Act: Non-owner (user1) registers private namespace with fee after initial period
        // ---------
        const tx = await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee });
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const createdAt = block!.timestamp;

        // ---------
        // Assert: Verify private namespace was registered correctly
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(createdAt);
        expect(isPrivate).to.equal(true);
    });

    it("Should refund excess payment when non-owner pays more than 10 ETH", async () => {
        // ---------
        // Arrange: Prepare parameters with excess payment
        // ---------
        const namespace = "web-private";
        const pricePerName = ethers.parseEther("0.006");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const excessPayment = ethers.parseEther("5"); // Pay 5 ETH more than required
        const totalPayment = fee + excessPayment; // 15 ETH total

        // Get user1 balance before transaction
        const balanceBefore = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Non-owner (user1) registers private namespace with excess payment
        // ---------
        const tx = await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: totalPayment });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get user1 balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Assert: Verify private namespace was registered and excess was refunded
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(true);

        // Verify refund: balance should decrease by fee (10 ETH) + gas costs (excess was refunded)
        // balanceAfter should equal balanceBefore - fee - gasCost
        const expectedBalanceAfter = balanceBefore - fee - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should refund excess payment when owner pays more than required fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time and prepare parameters with excess payment
        // ---------
        const namespace = "def-private";
        const pricePerName = ethers.parseEther("0.007");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const excessPayment = ethers.parseEther("5"); // Pay 5 ETH more than required
        const totalPayment = fee + excessPayment; // 15 ETH total
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
        // Act: Owner registers private namespace with excess payment after initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerPrivateNamespace(namespace, pricePerName, { value: totalPayment });
        const receipt = await tx.wait();
        
        // Calculate gas cost
        const gasUsed = receipt!.gasUsed;
        const gasPrice = receipt!.gasPrice || tx.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        // Get owner balance after transaction
        const balanceAfter = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Assert: Verify private namespace was registered and excess was refunded
        // ---------
        // Retrieve namespace information
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        // Verify namespace information
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(true);

        // Verify refund: balance should decrease by fee (10 ETH) + gas costs (excess was refunded)
        // balanceAfter should equal balanceBefore - fee - gasCost
        const expectedBalanceAfter = balanceBefore - fee - gasCost;
        expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Should process the ETH payment correctly (90% burnt, 10% to contract owner, 0% to namespace creator) when fee is paid", async () => {
        // ---------
        // Arrange: Prepare parameters and get initial state
        // ---------
        const namespace = "pay-private";
        const pricePerName = ethers.parseEther("0.008");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        
        // Get initial state
        const initialDETHBurned = await s.deth.burned(s.user1.address);
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address);
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address);
        
        // Calculate expected amounts
        const expectedBurnAmount = (fee * 90n) / 100n; // 90% = 9 ETH
        const expectedOwnerFee = (fee * 10n) / 100n; // 10% = 1 ETH
        const expectedCreatorFee = 0n; // 0% for private namespaces

        // ---------
        // Act: Non-owner (user1) registers private namespace with fee
        // ---------
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify payment processing
        // ---------
        // Verify namespace was registered
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(isPrivate).to.equal(true);

        // Verify 90% was burnt via DETH (credited to payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 0% was credited to namespace creator (private namespace creators receive no fees)
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 10% was credited to contract owner
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        expect(finalOwnerFees - initialOwnerFees).to.equal(expectedOwnerFee);
    });

    it("Should not distribute fees when owner registers with `msg.value > 0` during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters and verify we're within the initial period
        // ---------
        const namespace = "fee-private";
        const pricePerName = ethers.parseEther("0.009");
        const ethToSend = ethers.parseEther("10"); // Owner sends ETH even though it's free (using PRIVATE_NAMESPACE_REGISTRATION_FEE amount)
        
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
        // Act: Owner registers private namespace with ETH during initial period
        // ---------
        const tx = await s.xns.connect(s.owner).registerPrivateNamespace(namespace, pricePerName, { value: ethToSend });
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
        // Assert: Verify private namespace was registered but no fees were distributed
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        const block = await ethers.provider.getBlock(receipt!.blockNumber);

        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(returnedCreatedAt).to.equal(block!.timestamp);
        expect(isPrivate).to.equal(true);

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
        const namespace = "deth-private";
        const pricePerName = ethers.parseEther("0.010");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // Get initial DETH burned amount for non-owner (user1)
        const initialDETHBurned = await s.deth.burned(s.user1.address);

        // Calculate expected DETH amount (90% of fee)
        const expectedDETHAmount = (fee * 90n) / 100n; // 90% = 9 ETH

        // ---------
        // Act: Non-owner (user1) registers private namespace with fee during initial period
        // ---------
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify private namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user1.address);
        expect(isPrivate).to.equal(true);

        // Verify correct amount of DETH was credited to non-owner registrant (payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    it("Should credit correct amount of DETH to owner after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "own-private";
        const pricePerName = ethers.parseEther("0.011");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
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
        const expectedDETHAmount = (fee * 90n) / 100n; // 90% = 9 ETH

        // ---------
        // Act: Owner registers private namespace with fee after initial period
        // ---------
        await s.xns.connect(s.owner).registerPrivateNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify private namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.owner.address);
        expect(isPrivate).to.equal(true);

        // Verify correct amount of DETH was credited to owner (payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.owner.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    it("Should credit correct amount of DETH to non-owner registrant after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time to be after the initial period
        // ---------
        const namespace = "app-private";
        const pricePerName = ethers.parseEther("0.012");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
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
        const expectedDETHAmount = (fee * 90n) / 100n; // 90% = 9 ETH

        // ---------
        // Act: Non-owner (user2) registers private namespace with fee after initial period
        // ---------
        await s.xns.connect(s.user2).registerPrivateNamespace(namespace, pricePerName, { value: fee });

        // ---------
        // Assert: Verify private namespace was registered and DETH was credited correctly
        // ---------
        // Verify namespace was registered correctly
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [returnedPrice, creator, returnedCreatedAt, isPrivate] = await getNamespaceInfoByString(namespace);
        expect(returnedPrice).to.equal(pricePerName);
        expect(creator).to.equal(s.user2.address);
        expect(isPrivate).to.equal(true);

        // Verify correct amount of DETH was credited to non-owner registrant (payer/sponsor)
        const finalDETHBurned = await s.deth.burned(s.user2.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedDETHAmount);
    });

    it("Should allow multiple private namespaces with the same price (no price uniqueness)", async () => {
        // ---------
        // Arrange: Prepare parameters for two different private namespaces with the same price
        // ---------
        const namespace1 = "ns1-private";
        const namespace2 = "ns2-private";
        const pricePerName = ethers.parseEther("0.002"); // Same price for both
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act: Register first private namespace
        // ---------
        const tx1 = await s.xns.connect(s.user1).registerPrivateNamespace(namespace1, pricePerName, { value: fee });
        const receipt1 = await tx1.wait();
        const block1 = await ethers.provider.getBlock(receipt1!.blockNumber);
        const createdAt1 = block1!.timestamp;

        // ---------
        // Act: Register second private namespace with the same price (should succeed)
        // ---------
        const tx2 = await s.xns.connect(s.user2).registerPrivateNamespace(namespace2, pricePerName, { value: fee });
        const receipt2 = await tx2.wait();
        const block2 = await ethers.provider.getBlock(receipt2!.blockNumber);
        const createdAt2 = block2!.timestamp;

        // ---------
        // Assert: Verify both private namespaces were registered correctly
        // ---------
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        
        // Verify first namespace
        const [returnedPrice1, creator1, returnedCreatedAt1, isPrivate1] = await getNamespaceInfoByString(namespace1);
        expect(returnedPrice1).to.equal(pricePerName);
        expect(creator1).to.equal(s.user1.address);
        expect(returnedCreatedAt1).to.equal(createdAt1);
        expect(isPrivate1).to.equal(true);

        // Verify second namespace
        const [returnedPrice2, creator2, returnedCreatedAt2, isPrivate2] = await getNamespaceInfoByString(namespace2);
        expect(returnedPrice2).to.equal(pricePerName);
        expect(creator2).to.equal(s.user2.address);
        expect(returnedCreatedAt2).to.equal(createdAt2);
        expect(isPrivate2).to.equal(true);

        // Verify both namespaces have the same price (no uniqueness check)
        expect(returnedPrice1).to.equal(returnedPrice2);
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `NamespaceRegistered` event with correct parameters and `isPrivate = true`", async () => {
        // ---------
        // Arrange: Prepare parameters for private namespace registration
        // ---------
        const namespace = "evt-private";
        const pricePerName = ethers.parseEther("0.013");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Register private namespace and verify event emission
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        )
            .to.emit(s.xns, "NamespaceRegistered")
            .withArgs(namespace, pricePerName, s.user1.address, true);
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
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for private namespace longer than 16 characters", async () => {
        // ---------
        // Arrange: Prepare parameters with private namespace longer than 16 characters
        // ---------
        const namespace = "a".repeat(17); // 17 characters
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for private namespace with invalid characters", async () => {
        // ---------
        // Arrange: Prepare parameters with private namespace containing invalid characters
        // ---------
        const namespace = "aBc-private"; // Contains uppercase letter
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for private namespace starting with hyphen", async () => {
        // ---------
        // Arrange: Prepare parameters with private namespace starting with hyphen
        // ---------
        const namespace = "-private-ns";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for private namespace ending with hyphen", async () => {
        // ---------
        // Arrange: Prepare parameters with private namespace ending with hyphen
        // ---------
        const namespace = "private-ns-";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: invalid namespace` error for private namespace with consecutive hyphens", async () => {
        // ---------
        // Arrange: Prepare parameters with private namespace containing consecutive hyphens
        // ---------
        const namespace = "private--ns";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: invalid namespace");
    });

    it("Should revert with `XNS: 'eth' namespace forbidden` error when trying to register \"eth\" namespace", async () => {
        // ---------
        // Arrange: Prepare parameters with "eth" namespace
        // ---------
        const namespace = "eth";
        const pricePerName = ethers.parseEther("0.001");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register "eth" private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: 'eth' namespace forbidden");
    });

    it("Should revert with `XNS: pricePerName too low` error for price less than 0.001 ETH", async () => {
        // ---------
        // Arrange: Prepare parameters with price less than 0.001 ETH
        // ---------
        const namespace = "low-price";
        const pricePerName = ethers.parseEther("0.0005"); // Less than 0.001 ETH
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace with price less than 0.001 ETH and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: pricePerName too low");
    });

    it("Should revert with `XNS: price must be multiple of 0.001 ETH` error for non-multiple price", async () => {
        // ---------
        // Arrange: Prepare parameters with price that is not a multiple of 0.001 ETH
        // ---------
        const namespace = "mult-private";
        const pricePerName = ethers.parseEther("0.0015"); // 0.0015 ETH is not a multiple of 0.001 ETH
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // ---------
        // Act & Assert: Attempt to register private namespace with non-multiple price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: fee })
        ).to.be.revertedWith("XNS: price must be multiple of 0.001 ETH");
    });

    it("Should revert with `XNS: namespace already exists` error when namespace already exists", async () => {
        // ---------
        // Arrange: Register a private namespace first
        // ---------
        const namespace = "exst-private";
        const pricePerName1 = ethers.parseEther("0.015");
        const pricePerName2 = ethers.parseEther("0.016");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace with first price
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName1, { value: fee });

        // ---------
        // Act & Assert: Attempt to register the same private namespace again with different price and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerPrivateNamespace(namespace, pricePerName2, { value: fee })
        ).to.be.revertedWith("XNS: namespace already exists");
    });

    it("Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period", async () => {
        // ---------
        // Arrange: Prepare parameters with insufficient fee and verify we're within the initial period
        // ---------
        const namespace = "insf-private";
        const pricePerName = ethers.parseEther("0.017");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const insufficientFee = fee - ethers.parseEther("1"); // Pay 1 ETH less than required
        
        // Confirm that this registration is within the INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = latestBlock.timestamp;
        const initialPeriod = await s.xns.INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD();
        const deployedAt = await s.xns.DEPLOYED_AT();
        expect(now).to.be.lte(Number(deployedAt) + Number(initialPeriod));

        // ---------
        // Act & Assert: Attempt to register private namespace with insufficient fee and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: insufficientFee })
        ).to.be.revertedWith("XNS: insufficient namespace fee");
    });

    it("Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period", async () => {
        // ---------
        // Arrange: Fast-forward time and prepare parameters with insufficient fee
        // ---------
        const namespace = "ins2-private";
        const pricePerName = ethers.parseEther("0.018");
        const fee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
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
        // Act & Assert: Attempt to register private namespace with insufficient fee and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: insufficientFee })
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

        const namespace = "rfnd-private";
        const pricePerName = ethers.parseEther("0.019");
        const ethToSend = ethers.parseEther("10"); // Owner sends ETH during free period (using PRIVATE_NAMESPACE_REGISTRATION_FEE amount)

        // Impersonate the reverting receiver address and fund it so it can send transactions
        await impersonateAccount(revertingReceiverAddress);
        await ethers.provider.send("hardhat_setBalance", [
            revertingReceiverAddress,
            "0x1000000000000000000" // 1 ETH
        ]);
        const revertingReceiverSigner = await ethers.getSigner(revertingReceiverAddress);

        // ---------
        // Act & Assert: Attempt to register private namespace and expect refund to fail
        // ---------
        await expect(
            xnsWithRevertingOwner.connect(revertingReceiverSigner).registerPrivateNamespace(namespace, pricePerName, { value: ethToSend })
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

    it("Should register a name correctly in public namespace", async () => {
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

    it("Should allow namespace creator to register a paid name in public namespace during exclusive period", async () => {
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

    it("Should allow anyone to register paid names in public namespace after exclusive period (30 days)", async () => {
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

    it("Should refund excess payment to contract when registering in constructor with excess payment", async () => {
        // ---------
        // Arrange: Prepare parameters for contract deployment with excess payment
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "refundconstructor";
        const pricePerName = ethers.parseEther("0.001");
        const excessPayment = ethers.parseEther("0.0005"); // Pay 0.0005 ETH more than required
        const totalPayment = pricePerName + excessPayment; // 0.0015 ETH total

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get deployer (user2) balance before deployment
        const balanceBefore = await ethers.provider.getBalance(s.user2.address);

        // ---------
        // Act: Deploy contract that registers name in constructor with excess payment
        // ---------
        const SelfRegisteringContract = await ethers.getContractFactory("SelfRegisteringContract");
        const deployTx = await SelfRegisteringContract.connect(s.user2).deploy(
            await s.xns.getAddress(),
            label,
            namespace,
            { value: totalPayment }
        );
        const receipt = await deployTx.waitForDeployment();
        const deployReceipt = await deployTx.deploymentTransaction()!.wait();
        
        // Calculate gas cost
        const gasUsed = deployReceipt!.gasUsed;
        const gasPrice = deployReceipt!.gasPrice || deployTx.deploymentTransaction()!.gasPrice || 0n;
        const gasCost = gasUsed * gasPrice;

        const contractAddress = await deployTx.getAddress();

        // ---------
        // Assert: Verify excess payment was refunded to contract (not deployer)
        // ---------
        // Verify name was registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(contractAddress);

        // Get deployer balance after deployment
        const balanceAfter = await ethers.provider.getBalance(s.user2.address);

        // Get contract balance (should have excess payment, refund went to contract, not deployer)
        // Note: When called from constructor, msg.sender in XNS is the contract address, so refund goes to contract
        const contractBalance = await ethers.provider.getBalance(contractAddress);
        expect(contractBalance).to.equal(excessPayment);

        // Verify deployer paid: balance should decrease by totalPayment + gas costs
        // balanceAfter should equal balanceBefore - totalPayment - gasCost
        const expectedBalanceAfter = balanceBefore - totalPayment - gasCost;
        // Allow small tolerance for gas estimation differences
        expect(balanceAfter).to.be.closeTo(expectedBalanceAfter, ethers.parseEther("0.00001"));
    });

    it("Should refund excess payment to contract when registering via function with excess payment", async () => {
        // ---------
        // Arrange: Deploy contract and prepare excess payment
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "refundfunction";
        const pricePerName = ethers.parseEther("0.001");
        const excessPayment = ethers.parseEther("0.0005"); // Pay 0.0005 ETH more than required
        const totalPayment = pricePerName + excessPayment; // 0.0015 ETH total

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

        // Get contract balance before registration (should be 0)
        const contractBalanceBefore = await ethers.provider.getBalance(contractAddress);
        expect(contractBalanceBefore).to.equal(0);

        // ---------
        // Act: Contract registers name for itself via function with excess payment
        // ---------
        await contract.registerName(label, namespace, { value: totalPayment });

        // ---------
        // Assert: Verify excess payment was refunded to contract (not caller)
        // ---------
        // Verify name was registered
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);
        expect(ownerAddress).to.equal(contractAddress);

        // Get contract balance after registration
        const contractBalanceAfter = await ethers.provider.getBalance(contractAddress);

        // Verify refund went to contract: contract should have received the excess payment
        // Note: The refund goes to msg.sender in XNS, which is the contract address when called from a function
        expect(contractBalanceAfter).to.equal(excessPayment);
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

    it("Should revert with `XNS: private namespace` error when trying to register in private namespace", async () => {
        // ---------
        // Arrange: Register a private namespace first
        // ---------
        const namespace = "private";
        const label = "test";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period so anyone can register (if it were public)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // ---------
        // Act & Assert: Try to register name in private namespace and expect revert
        // ---------
        await expect(
            s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName })
        ).to.be.revertedWith("XNS: private namespace");
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

    it("Should allow namespace creator to sponsor registrations in public namespace during exclusive period (30 days)", async () => {
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

    it("Should allow anyone to sponsor registrations in public namespace after exclusive period (30 days)", async () => {
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

    it("Should allow namespace creator to sponsor registrations in private namespace (creator-only forever)", async () => {
        // ---------
        // Arrange: Register a private namespace and prepare parameters
        // ---------
        const namespace = "private";
        const label = "private-sponsored";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act: Namespace creator (user1) sponsors registration for recipient in private namespace
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

    it("Should process the ETH payment correctly for public namespace (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid", async () => {
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

    it("Should process the ETH payment correctly for private namespace (90% burnt, 10% to contract owner, 0% to namespace creator) when fee is paid", async () => {
        // ---------
        // Arrange: Register a private namespace and prepare parameters
        // ---------
        const namespace = "private-payment";
        const label = "paymenttest";
        const recipient = s.user2.address; // user2 is the recipient
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Get initial state
        const initialDETHBurned = await s.deth.burned(s.user1.address); // user1 (creator) is the sponsor/payer
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address); // user1 is namespace creator
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address); // owner is contract owner

        // Calculate expected amounts for private namespace (90% burnt, 10% to owner, 0% to creator)
        const expectedBurnAmount = (pricePerName * 90n) / 100n; // 90% = 0.0009 ETH
        const expectedCreatorFee = 0n; // 0% for private namespaces
        const expectedOwnerFee = pricePerName - expectedBurnAmount; // 10% = 0.0001 ETH

        // Create signature from recipient (user2)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act: Namespace creator (user1) sponsors registration for recipient in private namespace
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
        // Assert: Verify payment was processed correctly
        // ---------
        // Verify 90% was burnt via DETH
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 0% was credited to namespace creator (user1)
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 10% was credited to contract owner (owner)
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

    it("Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor during exclusive period in public namespace", async () => {
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

    it("Should revert with `XNS: not namespace creator (private)` error when non-creator tries to sponsor in private namespace", async () => {
        // ---------
        // Arrange: Register a private namespace and prepare parameters
        // ---------
        const namespace = "private-revert";
        const label = "test";
        const recipient = s.user2.address;
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

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
        ).to.be.revertedWith("XNS: not namespace creator (private)");
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

    it("Should process the ETH payment correctly for public namespace (90% burnt via DETH, 5% to namespace creator, 5% to contract owner) only for successful registrations", async () => {
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

    it("Should process the ETH payment correctly for private namespace (90% burnt via DETH, 10% to contract owner, 0% to namespace creator) only for successful registrations", async () => {
        // ---------
        // Arrange: Register a private namespace and prepare parameters with some registrations that will be skipped
        // ---------
        const namespace = "private-payment";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // First, register a name for user2 so they already have a name (will be skipped)
        await s.xns.connect(s.user1).registerNameWithAuthorization(
            {
                recipient: s.user2.address,
                label: "existing",
                namespace: namespace,
            },
            await s.signRegisterNameAuth(s.user2, s.user2.address, "existing", namespace),
            { value: pricePerName }
        );

        // Prepare batch registrations: user2 (already has name - skip), owner (new - succeed), user1 (new - succeed)
        const registrations = [
            { label: "alice", recipient: s.user2.address }, // user2 already has a name - will be skipped
            { label: "bob", recipient: s.owner.address }, // owner doesn't have a name - will succeed
            { label: "charlie", recipient: s.user1.address }, // user1 doesn't have a name - will succeed
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
        const expectedSuccessfulCount = 2n; // owner and user1, but not user2

        // Get initial state for payment verification
        const initialDETHBurned = await s.deth.burned(s.user1.address); // user1 (creator) is the sponsor/payer
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address); // user1 is namespace creator
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address); // owner is contract owner

        // Calculate expected amounts for private namespace (90% burnt, 10% to owner, 0% to creator) - only for 2 successful registrations
        const actualTotal = pricePerName * expectedSuccessfulCount;
        const expectedBurnAmount = (actualTotal * 90n) / 100n; // 90% of 2 * 0.001 ETH
        const expectedCreatorFee = 0n; // 0% for private namespaces
        const expectedOwnerFee = actualTotal - expectedBurnAmount; // 10% of 2 * 0.001 ETH

        // ---------
        // Act: Namespace creator (user1) sponsors batch registration in private namespace (user2 should be skipped)
        // ---------
        await s.xns.connect(s.user1).batchRegisterNameWithAuthorization(
            registerNameAuths,
            signatures,
            { value: totalPayment }
        );

        // ---------
        // Assert: Verify payment processing only for successful registrations
        // ---------
        // Verify 90% was burnt via DETH (credited to payer/sponsor - user1) for 2 successful registrations only
        const finalDETHBurned = await s.deth.burned(s.user1.address);
        expect(finalDETHBurned - initialDETHBurned).to.equal(expectedBurnAmount);

        // Verify 0% was credited to namespace creator (user1) for private namespace
        const finalCreatorFees = await s.xns.getPendingFees(s.user1.address);
        expect(finalCreatorFees - initialCreatorFees).to.equal(expectedCreatorFee);

        // Verify 10% was credited to contract owner (owner) for 2 successful registrations only
        const finalOwnerFees = await s.xns.getPendingFees(s.owner.address);
        expect(finalOwnerFees - initialOwnerFees).to.equal(expectedOwnerFee);

        // Verify that payment was only processed for 2 registrations, not 3
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

    it("Should allow namespace creator to sponsor batch registrations in public namespace during exclusive period (30 days)", async () => {
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

    it("Should allow anyone to sponsor batch registrations in public namespace after exclusive period (30 days)", async () => {
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

    it("Should allow namespace creator to sponsor batch registrations in private namespace (creator-only forever)", async () => {
        // ---------
        // Arrange: Register a private namespace and prepare parameters
        // ---------
        const namespace = "private-batch";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

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
        // Act: Namespace creator (user1) sponsors batch registrations in private namespace
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

    it("Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor during exclusive period in public namespace", async () => {
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

    it("Should revert with `XNS: not namespace creator (private)` error when non-creator tries to sponsor batch in private namespace", async () => {
        // ---------
        // Arrange: Register a private namespace and prepare batch registration with non-creator sponsor
        // ---------
        const namespace = "private-batch-re";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

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
        // Act & Assert: Should revert with not namespace creator (private) error
        // owner (non-creator) tries to sponsor in private namespace
        // ---------
        await expect(
            s.xns.connect(s.owner).batchRegisterNameWithAuthorization(
                registerNameAuths,
                signatures,
                { value: totalPayment }
            )
        ).to.be.revertedWith("XNS: not namespace creator (private)");
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
        const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
        await s.xns.connect(s.user2).registerPublicNamespace(namespace2, pricePerName2, { value: namespaceFee });

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

    it("Should allow public namespace creator to claim all pending fees for `msg.sender` and transfer to recipient (non-namespace-creator)", async () => {
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

    it("Should allow owner to claim all pending fees from private namespace registrations (10% of private namespace fees go to owner)", async () => {
        // ---------
        // Arrange: Register a private namespace and accumulate fees
        // ---------
        const namespace = "private-fees";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const recipient = s.user2.address; // Non-owner recipient

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

        // Get initial fees before private namespace registrations
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address);
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address);

        // Sponsor some name registrations in private namespace (user1 sponsors as creator)
        // Register 3 names to accumulate fees
        const registrations = [
            { label: "alice", recipient: s.user2.address },
            { label: "bob", recipient: s.owner.address },
            { label: "charlie", recipient: s.user1.address },
        ];

        for (const reg of registrations) {
            const signature = await s.signRegisterNameAuth(
                reg.recipient === s.user2.address ? s.user2 : reg.recipient === s.owner.address ? s.owner : s.user1,
                reg.recipient,
                reg.label,
                namespace
            );
            await s.xns.connect(s.user1).registerNameWithAuthorization(
                {
                    recipient: reg.recipient,
                    label: reg.label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            );
        }

        // Calculate expected fees: 10% of 3 registrations goes to owner, 0% to creator
        const totalFees = pricePerName * 3n;
        const expectedNewOwnerFees = (totalFees * 10n) / 100n; // 10% = 0.0003 ETH
        const expectedNewCreatorFees = 0n; // 0% for private namespaces
        const expectedTotalOwnerFees = initialOwnerFees + expectedNewOwnerFees;

        // Verify owner has pending fees (initial + new)
        const ownerPendingFees = await s.xns.getPendingFees(s.owner.address);
        expect(ownerPendingFees).to.equal(expectedTotalOwnerFees);

        // Verify creator fees haven't increased (should remain at initial value)
        const creatorPendingFees = await s.xns.getPendingFees(s.user1.address);
        expect(creatorPendingFees).to.equal(initialCreatorFees);

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
        // Verify recipient received the correct amount (total fees, not just new fees)
        const recipientFinalBalance = await ethers.provider.getBalance(recipient);
        const receivedAmount = recipientFinalBalance - recipientInitialBalance;
        expect(receivedAmount).to.equal(expectedTotalOwnerFees);

        // Verify pending fees are reset to zero
        const pendingFeesAfter = await s.xns.getPendingFees(s.owner.address);
        expect(pendingFeesAfter).to.equal(0);

        // Verify creator fees remain unchanged (should still be at initial value)
        const creatorPendingFeesAfter = await s.xns.getPendingFees(s.user1.address);
        expect(creatorPendingFeesAfter).to.equal(initialCreatorFees);
    });

    it("Should return zero fees for private namespace creator (private namespace creators receive 0% fees)", async () => {
        // ---------
        // Arrange: Register a private namespace and sponsor name registrations
        // ---------
        const namespace = "private-zero-fee";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

        // Get initial fees before private namespace registrations
        const initialOwnerFees = await s.xns.getPendingFees(s.owner.address);
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address);

        // Sponsor name registrations in private namespace (user1 sponsors as creator)
        // Register 2 names to accumulate fees
        const registrations = [
            { label: "alice", recipient: s.user2.address },
            { label: "bob", recipient: s.owner.address },
        ];

        for (const reg of registrations) {
            const signature = await s.signRegisterNameAuth(
                reg.recipient === s.user2.address ? s.user2 : s.owner,
                reg.recipient,
                reg.label,
                namespace
            );
            await s.xns.connect(s.user1).registerNameWithAuthorization(
                {
                    recipient: reg.recipient,
                    label: reg.label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            );
        }

        // Calculate expected fees: 10% of 2 registrations goes to owner, 0% to creator
        const totalFees = pricePerName * 2n;
        const expectedNewOwnerFees = (totalFees * 10n) / 100n; // 10% = 0.0002 ETH
        const expectedNewCreatorFees = 0n; // 0% for private namespaces
        const expectedTotalOwnerFees = initialOwnerFees + expectedNewOwnerFees;

        // ---------
        // Assert: Verify creator fees haven't increased and owner has received new fees
        // ---------
        // Verify creator fees haven't increased (should remain at initial value, not 0 if there were initial fees)
        const creatorPendingFees = await s.xns.getPendingFees(s.user1.address);
        expect(creatorPendingFees).to.equal(initialCreatorFees);

        // Verify owner has received new fees (initial + new fees)
        const ownerPendingFees = await s.xns.getPendingFees(s.owner.address);
        expect(ownerPendingFees).to.equal(expectedTotalOwnerFees);
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

    it("Should allow public namespace creator to claim all pending fees to themselves", async () => {
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

  describe("claimFeesToSelf", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

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
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for owner
        const expectedFees = await s.xns.getPendingFees(s.owner.address);
        expect(expectedFees).to.be.gt(0);

        // Get initial balance of owner
        const ownerInitialBalance = await ethers.provider.getBalance(s.owner.address);

        // ---------
        // Act: Owner claims fees to themselves using claimFeesToSelf
        // ---------
        const tx = await s.xns.connect(s.owner).claimFeesToSelf();
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

    it("Should allow public namespace creator to claim all pending fees to themselves", async () => {
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
        await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

        // Get the pending fees for namespace creator (user1)
        const expectedFees = await s.xns.getPendingFees(s.user1.address);
        expect(expectedFees).to.be.gt(0);

        // Get initial balance of namespace creator
        const creatorInitialBalance = await ethers.provider.getBalance(s.user1.address);

        // ---------
        // Act: Namespace creator claims fees to themselves using claimFeesToSelf
        // ---------
        const tx = await s.xns.connect(s.user1).claimFeesToSelf();
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

    it("Should return zero fees for private namespace creator when claiming to self (private namespace creators receive 0% fees)", async () => {
        // ---------
        // Arrange: Register a private namespace and sponsor name registrations
        // ---------
        const namespace = "private-claim-se";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Fast-forward time past the exclusivity period (even though it doesn't matter for private namespaces)
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

        // Get initial fees before private namespace registrations
        const initialCreatorFees = await s.xns.getPendingFees(s.user1.address);

        // Sponsor name registrations in private namespace (user1 sponsors as creator)
        // Register 2 names to accumulate fees
        const registrations = [
            { label: "alice", recipient: s.user2.address },
            { label: "bob", recipient: s.owner.address },
        ];

        for (const reg of registrations) {
            const signature = await s.signRegisterNameAuth(
                reg.recipient === s.user2.address ? s.user2 : s.owner,
                reg.recipient,
                reg.label,
                namespace
            );
            await s.xns.connect(s.user1).registerNameWithAuthorization(
                {
                    recipient: reg.recipient,
                    label: reg.label,
                    namespace: namespace,
                },
                signature,
                { value: pricePerName }
            );
        }

        // Calculate expected fees: 0% to creator for private namespaces
        const expectedCreatorFees = 0n; // 0% for private namespaces
        const expectedTotalCreatorFees = initialCreatorFees + expectedCreatorFees; // Should remain at initial value

        // ---------
        // Assert: Verify creator has no new fees (should remain at initial value)
        // ---------
        // Verify creator fees haven't increased (should remain at initial value)
        const creatorPendingFees = await s.xns.getPendingFees(s.user1.address);
        expect(creatorPendingFees).to.equal(initialCreatorFees);

        // Verify creator can still claim their initial fees (if any) using claimFeesToSelf
        // But private namespace registrations don't add to their fees
        if (initialCreatorFees > 0n) {
            const creatorInitialBalance = await ethers.provider.getBalance(s.user1.address);
            const tx = await s.xns.connect(s.user1).claimFeesToSelf();
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

            // Verify creator received only their initial fees (accounting for gas costs)
            const creatorFinalBalance = await ethers.provider.getBalance(s.user1.address);
            const receivedAmount = creatorFinalBalance - creatorInitialBalance + gasUsed;
            expect(receivedAmount).to.equal(initialCreatorFees);

            // Verify pending fees are reset to zero
            const pendingFeesAfter = await s.xns.getPendingFees(s.user1.address);
            expect(pendingFeesAfter).to.equal(0);
        } else {
            // If creator has no initial fees, they should have 0 fees and can't claim
            expect(creatorPendingFees).to.equal(0);
        }
    });

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `FeesClaimed` event with `msg.sender` as recipient", async () => {
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
        // Act: Owner claims fees to themselves using claimFeesToSelf
        // ---------
        const tx = await s.xns.connect(s.owner).claimFeesToSelf();
        const receipt = await tx.wait();

        // ---------
        // Assert: Verify FeesClaimed event was emitted with msg.sender as recipient
        // ---------
        const events = await s.xns.queryFilter(s.xns.filters.FeesClaimed(), receipt!.blockNumber, receipt!.blockNumber);
        expect(events.length).to.equal(1);
        expect(events[0].args.recipient).to.equal(s.owner.address);
        expect(events[0].args.amount).to.equal(expectedFees);
    });

    // -----------------------
    // Reverts
    // -----------------------

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
            s.xns.connect(s.user2).claimFeesToSelf()
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

        // Set the reverting receiver's code at the owner's address using hardhat_setCode
        // This simulates the owner being a contract that reverts on receive
        const revertingReceiverCode = await ethers.provider.getCode(await revertingReceiver.getAddress());
        await ethers.provider.send("hardhat_setCode", [s.owner.address, revertingReceiverCode!]);

        // ---------
        // Act & Assert: Attempt to claim fees to self when owner is a reverting contract
        // ---------
        await expect(
            s.xns.connect(s.owner).claimFeesToSelf()
        ).to.be.revertedWith("XNS: fee transfer failed");
    });

  });

  describe("isValidSignature", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return `true` for valid EOA signature", async () => {
        // ---------
        // Arrange: Create a valid signature from an EOA
        // ---------
        const recipient = s.user2.address;
        const label = "alice";
        const namespace = "xns";

        // Create a valid signature
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);

        // ---------
        // Act: Check if signature is valid
        // ---------
        const isValid = await s.xns.isValidSignature(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            signature
        );

        // ---------
        // Assert: Signature should be valid
        // ---------
        expect(isValid).to.be.true;
    });

    it("Should return `true` for valid EIP-1271 contract wallet signature", async () => {
        // ---------
        // Arrange: Create a valid signature from EIP-1271 wallet owner
        // ---------
        const walletAddress = await s.eip1271Wallet.getAddress();
        const label = "alice";
        const namespace = "xns";

        // Create signature from the wallet's owner (user2)
        const signature = await s.signRegisterNameAuth(s.user2, walletAddress, label, namespace);

        // ---------
        // Act: Check if signature is valid for EIP-1271 wallet
        // ---------
        const isValid = await s.xns.isValidSignature(
            {
                recipient: walletAddress,
                label: label,
                namespace: namespace,
            },
            signature
        );

        // ---------
        // Assert: Signature should be valid (EIP-1271 wallet will validate it)
        // ---------
        expect(isValid).to.be.true;
    });

    it("Should return `false` for invalid signature", async () => {
        // ---------
        // Arrange: Create an invalid signature (wrong bytes)
        // ---------
        const recipient = s.user2.address;
        const label = "alice";
        const namespace = "xns";

        // Create an invalid signature (random bytes)
        const invalidSignature = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456";

        // ---------
        // Act: Check if invalid signature is valid
        // ---------
        const isValid = await s.xns.isValidSignature(
            {
                recipient: recipient,
                label: label,
                namespace: namespace,
            },
            invalidSignature
        );

        // ---------
        // Assert: Signature should be invalid
        // ---------
        expect(isValid).to.be.false;
    });

    it("Should return `false` for signature from wrong recipient", async () => {
        // ---------
        // Arrange: Create signature from user2 but check for user1 as recipient
        // ---------
        const actualRecipient = s.user2.address;
        const wrongRecipient = s.user1.address;
        const label = "alice";
        const namespace = "xns";

        // Create signature from user2 for themselves
        const signature = await s.signRegisterNameAuth(s.user2, actualRecipient, label, namespace);

        // ---------
        // Act: Check if signature is valid for wrong recipient
        // ---------
        const isValid = await s.xns.isValidSignature(
            {
                recipient: wrongRecipient, // Wrong recipient
                label: label,
                namespace: namespace,
            },
            signature
        );

        // ---------
        // Assert: Signature should be invalid (wrong recipient)
        // ---------
        expect(isValid).to.be.false;
    });

    it("Should return `false` for signature with wrong label", async () => {
        // ---------
        // Arrange: Create signature with one label but check with different label
        // ---------
        const recipient = s.user2.address;
        const correctLabel = "alice";
        const wrongLabel = "bob";
        const namespace = "xns";

        // Create signature with correct label
        const signature = await s.signRegisterNameAuth(s.user2, recipient, correctLabel, namespace);

        // ---------
        // Act: Check if signature is valid with wrong label
        // ---------
        const isValid = await s.xns.isValidSignature(
            {
                recipient: recipient,
                label: wrongLabel, // Wrong label
                namespace: namespace,
            },
            signature
        );

        // ---------
        // Assert: Signature should be invalid (wrong label)
        // ---------
        expect(isValid).to.be.false;
    });

    it("Should return `false` for signature with wrong namespace", async () => {
        // ---------
        // Arrange: Create signature with one namespace but check with different namespace
        // ---------
        const recipient = s.user2.address;
        const label = "alice";
        const correctNamespace = "xns";
        const wrongNamespace = "yolo";

        // Create signature with correct namespace
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, correctNamespace);

        // ---------
        // Act: Check if signature is valid with wrong namespace
        // ---------
        const isValid = await s.xns.isValidSignature(
            {
                recipient: recipient,
                label: label,
                namespace: wrongNamespace, // Wrong namespace
            },
            signature
        );

        // ---------
        // Assert: Signature should be invalid (wrong namespace)
        // ---------
        expect(isValid).to.be.false;
    });

  });

  describe("getAddress(label,namespace)", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return correct owner address for registered name", async () => {
        // ---------
        // Arrange: Register a name
        // ---------
        const namespace = "xns"; // Already registered in setup
        const pricePerName = ethers.parseEther("0.001");
        const label = "alice";

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register name for user2
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // ---------
        // Act: Get address for the registered name
        // ---------
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);

        // ---------
        // Assert: Should return the correct owner address
        // ---------
        expect(ownerAddress).to.equal(s.user2.address);
    });

    it("Should return `address(0)` for unregistered name", async () => {
        // ---------
        // Arrange: Use an unregistered name
        // ---------
        const namespace = "xns"; // Already registered in setup
        const label = "unregistered";

        // ---------
        // Act: Get address for the unregistered name
        // ---------
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);

        // ---------
        // Assert: Should return address(0) for unregistered name
        // ---------
        expect(ownerAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should handle special namespace \"x\" correctly", async () => {
        // ---------
        // Arrange: Register a name in the special "x" namespace (bare name)
        // ---------
        const namespace = "x";
        const pricePerName = ethers.parseEther("100"); // Special namespace price
        const label = "vitalik";

        // Fast-forward time past the exclusivity period so anyone can register
        const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
        await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

        // Register bare name for user2
        await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

        // ---------
        // Act: Get address for the bare name using "x" namespace
        // ---------
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);

        // ---------
        // Assert: Should return the correct owner address for bare name
        // ---------
        expect(ownerAddress).to.equal(s.user2.address);

        // Also verify that getAddress with full name works (bare names are equivalent to "label.x")
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddressByFullName = await getAddressByFullName(fullName);
        expect(ownerAddressByFullName).to.equal(s.user2.address);
    });

    it("Should return correct recipient address for sponsored name in private namespace", async () => {
        // ---------
        // Arrange: Register a private namespace and sponsor a name registration
        // ---------
        const namespace = "my-private-ns";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const label = "alice";
        const recipient = s.user2.address;

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address); // user1 is the namespace creator
        expect(isPrivate).to.equal(true); // Verify it's private

        // Sponsor name registration in private namespace (user1 sponsors as creator)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);
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
        // Act: Get address for the registered name in private namespace
        // ---------
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);

        // ---------
        // Assert: Should return the correct recipient address
        // ---------
        expect(ownerAddress).to.equal(recipient);
        expect(ownerAddress).to.equal(s.user2.address);
    });

    it("Should return `address(0)` for unregistered name in private namespace", async () => {
        // ---------
        // Arrange: Register a private namespace but don't register any names
        // ---------
        const namespace = "private-test";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const label = "unregistered";

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, , , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(isPrivate).to.equal(true); // Verify it's private

        // ---------
        // Act: Get address for an unregistered name in the private namespace
        // ---------
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);

        // ---------
        // Assert: Should return address(0) for unregistered name
        // ---------
        expect(ownerAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return correct address for long private namespace (up to 16 characters)", async () => {
        // ---------
        // Arrange: Register a long private namespace (16 characters) and sponsor a name registration
        // ---------
        const namespace = "my-private-names"; // 16 characters (max length for private namespaces)
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const label = "test";
        const recipient = s.user2.address;

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Verify namespace is private and has correct length
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address);
        expect(isPrivate).to.equal(true);
        expect(namespace.length).to.equal(16); // Verify it's the max length

        // Sponsor name registration in private namespace (user1 sponsors as creator)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);
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
        // Act: Get address for the registered name in long private namespace
        // ---------
        const getAddressByLabelAndNamespace = s.xns.getFunction("getAddress(string,string)");
        const ownerAddress = await getAddressByLabelAndNamespace(label, namespace);

        // ---------
        // Assert: Should return the correct recipient address
        // ---------
        expect(ownerAddress).to.equal(recipient);
        expect(ownerAddress).to.equal(s.user2.address);
    });

  });

  describe("getAddress(fullName)", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should resolve full name with dot notation correctly (e.g., \"alice.001\")", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.01");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("001", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("alice", "001", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("alice.001")).to.equal(user3.address);
    });

    it("Should resolve bare label with 1 character (e.g., \"a\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("a", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("a")).to.equal(user3.address);
    });

    it("Should resolve bare label with 2 characters (e.g., \"ab\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("ab", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("ab")).to.equal(user3.address);
    });

    it("Should resolve bare label with 3 characters (e.g., \"abc\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("abc", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("abc")).to.equal(user3.address);
    });

    it("Should resolve bare label with 4 characters (e.g., \"nike\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("nike", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("nike")).to.equal(user3.address);
    });

    it("Should resolve bare label with 5 characters (e.g., \"alice\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("alice", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("alice")).to.equal(user3.address);
    });

    it("Should resolve bare label with 6 characters (e.g., \"snoopy\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("snoopy", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("snoopy")).to.equal(user3.address);
    });

    it("Should resolve bare label with 7 characters (e.g., \"bankless\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("bankless", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("bankless")).to.equal(user3.address);
    });

    it("Should resolve explicit \".x\" namespace (e.g., \"adidas.x\")", async () => {
      // ---------
      // Arrange
      // ---------
      const specialNamespacePrice = ethers.parseEther("100");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerName("adidas", "x", { value: specialNamespacePrice });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("adidas.x")).to.equal(user3.address);
    });

    it("Should resolve correctly for one-character namespaces", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.002");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("a", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("bob", "a", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("bob.a")).to.equal(user3.address);
    });

    it("Should resolve correctly for two-character namespaces", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.002");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("ab", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("charlie", "ab", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("charlie.ab")).to.equal(user3.address);
    });

    it("Should resolve correctly for three-character namespaces", async () => {
      // ---------
      // Arrange
      // ---------
      const pricePerName = ethers.parseEther("0.003");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      // "xns" namespace already registered in setup
      await s.xns.connect(user3).registerName("david", "xns", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("david.xns")).to.equal(user3.address);
    });

    it("Should resolve correctly for four-character namespaces", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.002");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("abcd", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("eve", "abcd", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("eve.abcd")).to.equal(user3.address);
    });

    it("Should resolve fullnames with three characters", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.004");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("a", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("xy", "a", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("xy.a")).to.equal(user3.address);
    });

    it("Should resolve fullnames with four characters", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.005");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("abc", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("a", "abc", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("a.abc")).to.equal(user3.address);
    });

    it("Should resolve fullnames with five characters", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.006");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("abc", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("ab", "abc", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("ab.abc")).to.equal(user3.address);
    });

    it("Should resolve fullnames with six characters", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.007");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("abc", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("abc", "abc", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("abc.abc")).to.equal(user3.address);
    });

    it("Should resolve fullnames with seven characters", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.008");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      await s.xns.connect(user3).registerPublicNamespace("abc", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("abcd", "abc", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("abcd.abc")).to.equal(user3.address);
    });

    it("Should resolve fullnames with twenty-five characters", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.009");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      // 20-character label (max) + 4-character namespace (max) = 25 characters total
      await s.xns.connect(user3).registerPublicNamespace("abcd", pricePerName, { value: namespaceFee });
      await s.xns.connect(user3).registerName("abcdefghijklmnopqrst", "abcd", { value: pricePerName });

      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("abcdefghijklmnopqrst.abcd")).to.equal(user3.address);
    });

    it("Should return `address(0)` for unregistered names", async () => {
      // ---------
      // Arrange
      // ---------
      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("unregistered.xns")).to.equal(ethers.ZeroAddress);
      expect(await getAddressByFullName("unknown.x")).to.equal(ethers.ZeroAddress);
      expect(await getAddressByFullName("notregistered")).to.equal(ethers.ZeroAddress);
    });

    it("Should return `address(0)` for empty string", async () => {
      // ---------
      // Arrange
      // ---------
      const getAddressByFullName = s.xns.getFunction("getAddress(string)");

      // ---------
      // Act & Assert
      // ---------
      expect(await getAddressByFullName("")).to.equal(ethers.ZeroAddress);
    });

  });

  describe("getName", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return full name with namespace for regular names (e.g., returns \"alice.001\")", async () => {
      // ---------
      // Arrange
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const pricePerName = ethers.parseEther("0.002");
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      // Register public namespace "001"
      await s.xns.connect(user3).registerPublicNamespace("001", pricePerName, { value: namespaceFee });
      
      // Register name "alice" in namespace "001"
      await s.xns.connect(user3).registerName("alice", "001", { value: pricePerName });

      // ---------
      // Act
      // ---------
      const name = await s.xns.getName(user3.address);

      // ---------
      // Assert
      // ---------
      expect(name).to.equal("alice.001");
    });

    it("Should return full name with namespace for private namespace names (e.g., returns \"alice.my-private\")", async () => {
      // ---------
      // Arrange: Register a private namespace and sponsor a name registration
      // ---------
      const namespace = "my-private";
      const pricePerName = ethers.parseEther("0.001");
      const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
      const label = "alice";
      const recipient = s.user2.address;

      const signers = await ethers.getSigners();
      const user3 = signers[3];

      // Register private namespace by user3 (creator)
      await s.xns.connect(user3).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

      // Verify namespace is private
      const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
      const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
      expect(creator).to.equal(user3.address);
      expect(isPrivate).to.equal(true);

      // Sponsor name registration in private namespace (user3 sponsors as creator)
      const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);
      await s.xns.connect(user3).registerNameWithAuthorization(
          {
              recipient: recipient,
              label: label,
              namespace: namespace,
          },
          signature,
          { value: pricePerName }
      );

      // ---------
      // Act: Get name for the recipient address
      // ---------
      const name = await s.xns.getName(recipient);

      // ---------
      // Assert: Should return full name with private namespace
      // ---------
      expect(name).to.equal("alice.my-private");
    });

    it("Should return bare name without \".x\" suffix for names in the \"x\" namespace (e.g., returns \"vitalik\" not \"vitalik.x\")", async () => {
      // ---------
      // Arrange
      // ---------
      const namespace = "x";
      const pricePerName = ethers.parseEther("100"); // Special namespace price
      const label = "vitalik";
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400);

      // Register bare name for user2
      await s.xns.connect(s.user2).registerName(label, namespace, { value: pricePerName });

      // ---------
      // Act
      // ---------
      const name = await s.xns.getName(s.user2.address);

      // ---------
      // Assert
      // ---------
      expect(name).to.equal("vitalik");
      expect(name).to.not.equal("vitalik.x");
    });

    it("Should return empty string for address without a name", async () => {
      // ---------
      // Arrange: Use an address that hasn't registered any name
      // ---------
      const signers = await ethers.getSigners();
      const unregisteredUser = signers[5];

      // ---------
      // Act
      // ---------
      const name = await s.xns.getName(unregisteredUser.address);

      // ---------
      // Assert
      // ---------
      expect(name).to.equal("");
    });

    it("Should return `address(0)` for \"foo.bar.baz\" (parses correctly with full reverse scan as label=\"foo.bar\", namespace=\"baz\")", async () => {
        // ---------
        // Arrange
        // ---------
        // "foo.bar.baz" uses full reverse scan (finds last '.' from the right).
        // It finds '.' at the last position (between "bar" and "baz"),
        // so it parses as label="foo.bar" and namespace="baz".
        // Since "foo.bar.baz" is not registered, it should return address(0).
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
  
        // ---------
        // Act & Assert
        // ---------
        // The name "foo.bar.baz" will be parsed as label="foo.bar" and namespace="baz",
        // which is not registered, so it returns address(0).
        expect(await getAddressByFullName("foo.bar.baz")).to.equal(ethers.ZeroAddress);
      });

    it("Should resolve correctly for long private namespaces (e.g., \"label.my-private-namespace\" with namespace up to 16 characters)", async () => {
        // ---------
        // Arrange: Register a long private namespace (16 characters) and sponsor a name registration
        // ---------
        const namespace = "my-private-names"; // 16 characters (max length for private namespaces)
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const label = "label";
        const recipient = s.user2.address;

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Verify namespace is private and has correct length
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address);
        expect(isPrivate).to.equal(true);
        expect(namespace.length).to.equal(16); // Verify it's the max length

        // Sponsor name registration in private namespace (user1 sponsors as creator)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);
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
        // Act: Get address using full name format
        // ---------
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddress = await getAddressByFullName(fullName);

        // ---------
        // Assert: Should return the correct recipient address
        // ---------
        expect(ownerAddress).to.equal(recipient);
        expect(ownerAddress).to.equal(s.user2.address);
    });

    it("Should return correct address for \"label.my-private\" (correctly parses long private namespace with full reverse scan)", async () => {
        // ---------
        // Arrange: Register a private namespace "my-private" and sponsor a name registration
        // ---------
        const namespace = "my-private";
        const pricePerName = ethers.parseEther("0.001");
        const privateNamespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
        const label = "label";
        const recipient = s.user2.address;

        // Register private namespace by user1 (creator)
        await s.xns.connect(s.user1).registerPrivateNamespace(namespace, pricePerName, { value: privateNamespaceFee });

        // Verify namespace is private
        const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
        const [, creator, , isPrivate] = await getNamespaceInfoByString(namespace);
        expect(creator).to.equal(s.user1.address);
        expect(isPrivate).to.equal(true);

        // Sponsor name registration in private namespace (user1 sponsors as creator)
        const signature = await s.signRegisterNameAuth(s.user2, recipient, label, namespace);
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
        // Act: Get address using full name format "label.my-private"
        // ---------
        const fullName = `${label}.${namespace}`;
        const getAddressByFullName = s.xns.getFunction("getAddress(string)");
        const ownerAddress = await getAddressByFullName(fullName);

        // ---------
        // Assert: Should return the correct recipient address (full reverse scan correctly parses the long private namespace)
        // ---------
        expect(ownerAddress).to.equal(recipient);
        expect(ownerAddress).to.equal(s.user2.address);
    });

  });

  describe("getNamespaceInfo(namespace string)", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return correct details for public namespace", async () => {
      // ---------
      // Arrange: Register a new public namespace for testing
      // ---------
      const namespaceFee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const namespace = "test";
      const pricePerName = ethers.parseEther("0.003");
      const signers = await ethers.getSigners();
      const user3 = signers[3];

      // Register public namespace
      const tx = await s.xns.connect(user3).registerPublicNamespace(namespace, pricePerName, { value: namespaceFee });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const createdAt = block!.timestamp;

      // ---------
      // Act: Get namespace info
      // ---------
      const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
      const [returnedPricePerName, returnedCreator, returnedCreatedAt, returnedIsPrivate] = await getNamespaceInfoByString(namespace);

      // ---------
      // Assert: Verify all details are correct
      // ---------
      expect(returnedPricePerName).to.equal(pricePerName);
      expect(returnedCreator).to.equal(user3.address);
      expect(returnedCreatedAt).to.equal(createdAt);
      expect(returnedIsPrivate).to.equal(false); // Public namespace should have isPrivate = false
    });

    it("Should return correct details for private namespace", async () => {
      // ---------
      // Arrange: Register a new private namespace for testing
      // ---------
      const namespaceFee = await s.xns.PRIVATE_NAMESPACE_REGISTRATION_FEE();
      const namespace = "private-test";
      const pricePerName = ethers.parseEther("0.001");
      const signers = await ethers.getSigners();
      const user3 = signers[3];

      // Register private namespace
      const tx = await s.xns.connect(user3).registerPrivateNamespace(namespace, pricePerName, { value: namespaceFee });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const createdAt = block!.timestamp;

      // ---------
      // Act: Get namespace info
      // ---------
      const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
      const [returnedPricePerName, returnedCreator, returnedCreatedAt, returnedIsPrivate] = await getNamespaceInfoByString(namespace);

      // ---------
      // Assert: Verify all details are correct
      // ---------
      expect(returnedPricePerName).to.equal(pricePerName);
      expect(returnedCreator).to.equal(user3.address);
      expect(returnedCreatedAt).to.equal(createdAt);
      expect(returnedIsPrivate).to.equal(true); // Private namespace should have isPrivate = true
    });

    // -----------------------
    // Reverts
    // -----------------------

    it("Should revert with `XNS: namespace not found` error for non-existent namespace", async () => {
      // ---------
      // Arrange: Use a non-existent namespace
      // ---------
      const nonExistentNamespace = "none";

      // ---------
      // Act & Assert: Attempt to get namespace info for non-existent namespace
      // ---------
      const getNamespaceInfoByString = s.xns.getFunction("getNamespaceInfo(string)");
      await expect(
        getNamespaceInfoByString(nonExistentNamespace)
      ).to.be.revertedWith("XNS: namespace not found");
    });

  });

  describe("getPendingFees", function () {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    // -----------------------
    // Functionality
    // -----------------------

    it("Should return zero for address with no pending fees", async () => {
      // ---------
      // Arrange: Use an address that hasn't accumulated any fees
      // ---------
      const signers = await ethers.getSigners();
      const userWithNoFees = signers[5];

      // ---------
      // Act: Get pending fees for address with no fees
      // ---------
      const pendingFees = await s.xns.getPendingFees(userWithNoFees.address);

      // ---------
      // Assert: Should return zero
      // ---------
      expect(pendingFees).to.equal(0);
    });

    it("Should return correct amount for address with pending fees", async () => {
      // ---------
      // Arrange: Accumulate fees for namespace creator
      // ---------
      const namespace = "xns"; // Already registered in setup by user1
      const pricePerName = ethers.parseEther("0.001");
      
      // Claim any existing fees to reset to zero
      const existingFees = await s.xns.getPendingFees(s.user1.address);
      if (existingFees > 0) {
        await s.xns.connect(s.user1).claimFeesToSelf();
      }
      
      // Fast-forward time past the exclusivity period so anyone can register
      const exclusivityPeriod = await s.xns.NAMESPACE_CREATOR_EXCLUSIVE_PERIOD();
      await time.increase(Number(exclusivityPeriod) + 86400); // 30 days + 1 day

      // Register a name to accumulate fees for the namespace creator (5% of pricePerName)
      // Namespace creator (user1) gets 5% of each registration fee in their namespace
      await s.xns.connect(s.user2).registerName("alice", namespace, { value: pricePerName });

      // Calculate expected fees: 5% of pricePerName
      const expectedFees = pricePerName * 5n / 100n;

      // ---------
      // Act: Get pending fees for namespace creator
      // ---------
      const pendingFees = await s.xns.getPendingFees(s.user1.address);

      // ---------
      // Assert: Should return the correct amount
      // ---------
      expect(pendingFees).to.equal(expectedFees);
    });

  });
});

