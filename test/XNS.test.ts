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

  describe("Constructor", function () {
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

    // -----------------------
    // Events
    // -----------------------

    it("Should emit `NamespaceRegistered` event for special namespace", async () => {
        await expect(s.xns.deploymentTransaction())
            .to.emit(s.xns, "NamespaceRegistered")
            .withArgs("x", ethers.parseEther("100"), s.owner.address);
    });

    
  });
});

