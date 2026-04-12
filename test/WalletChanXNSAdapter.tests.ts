import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { XNS, WalletChanXNSAdapter } from "../typechain-types";

/** ethers `Contract.getAddress()` (no-arg) shadows ABI `getAddress(string)` on this contract — use getFunction for lookups. */
function adapterGetFullName(adapter: WalletChanXNSAdapter) {
  return adapter.getFunction("getAddress(string)");
}

function adapterGetLabelNs(adapter: WalletChanXNSAdapter) {
  return adapter.getFunction("getAddress(string,string)");
}

describe("WalletChanXNSAdapter", function () {
  interface Fixture {
    xns: XNS;
    adapter: WalletChanXNSAdapter;
    owner: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
    user3: SignerWithAddress;
    priceXnsNs: bigint;
  }

  /// XNS + DETH at hardcoded address, `xns` namespace registered, exclusivity elapsed — ready to deploy adapter with exact name fee.
  async function setupWithXnsNamespace(): Promise<Omit<Fixture, "adapter">> {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const DETH_ADDRESS = "0xE46861C9f28c46F27949fb471986d59B256500a7";
    const dethDeployed = await ethers.deployContract("DETH");
    await dethDeployed.waitForDeployment();
    const dethBytecode = await ethers.provider.getCode(dethDeployed.target);
    await ethers.provider.send("hardhat_setCode", [DETH_ADDRESS, dethBytecode!]);

    const xns = await ethers.deployContract("XNS", [owner.address]);
    await xns.waitForDeployment();

    const namespaceFee = await xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
    const pricePerName = ethers.parseEther("0.001");
    await xns.connect(user1).registerPublicNamespace("xns", pricePerName, { value: namespaceFee });

    await time.increase((await xns.EXCLUSIVITY_PERIOD()) + 86400n);

    const priceXnsNs = await xns.getNamespacePrice("xns");

    return { xns, owner, user1, user2, user3, priceXnsNs };
  }

  async function deployAdapterFixture(): Promise<Fixture> {
    const base = await setupWithXnsNamespace();
    const adapter = await ethers.deployContract("WalletChanXNSAdapter", [await base.xns.getAddress()], {
      value: base.priceXnsNs,
    });
    await adapter.waitForDeployment();
    return { ...base, adapter };
  }

  describe("Constructor", function () {
    it("Should revert with `WalletChanAdapter: 0x XNS` when xns is zero address", async function () {
      await expect(ethers.deployContract("WalletChanXNSAdapter", [ethers.ZeroAddress], { value: 0 })).to.be.revertedWith(
        "WalletChanAdapter: 0x XNS",
      );
    });

    it("Should set XNS immutable and register walletchanadapter.xns", async function () {
      const s = await loadFixture(deployAdapterFixture);
      expect(await s.adapter.XNS()).to.equal(await s.xns.getAddress());

      const getAddr = s.xns.getFunction("getAddress(string,string)");
      expect(await getAddr("walletchanadapter", "xns")).to.equal(await s.adapter.getAddress());
    });

    it("Should revert when msg.value is insufficient for registerName on xns namespace", async function () {
      const base = await loadFixture(setupWithXnsNamespace);
      const tooLow = base.priceXnsNs > 0n ? base.priceXnsNs - 1n : 0n;
      await expect(
        ethers.deployContract("WalletChanXNSAdapter", [await base.xns.getAddress()], { value: tooLow }),
      ).to.be.reverted;
    });
  });

  describe("getAddress(fullName)", function () {
    let s: Fixture;

    beforeEach(async function () {
      s = await loadFixture(deployAdapterFixture);
    });

    it("Should return address(0) for names ending with .mega", async function () {
      const af = adapterGetFullName(s.adapter);
      expect(await af("alice.mega")).to.equal(ethers.ZeroAddress);
      expect(await af("a.mega")).to.equal(ethers.ZeroAddress);
    });

    it("Should return address(0) for names ending with .wei", async function () {
      const af = adapterGetFullName(s.adapter);
      expect(await af("bob.wei")).to.equal(ethers.ZeroAddress);
    });

    it("Should forward bare mega and wei to XNS (not blocked)", async function () {
      const xns = s.xns;
      const barePrice = await xns.BARE_NAME_PRICE();
      await xns.connect(s.user2).registerName("mega", "x", { value: barePrice });
      await xns.connect(s.user3).registerName("wei", "x", { value: barePrice });

      const getAddrFull = xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await af("mega")).to.equal(await getAddrFull("mega"));
      expect(await af("wei")).to.equal(await getAddrFull("wei"));
    });

    it("Should forward non-blocked full names to XNS", async function () {
      const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const p = ethers.parseEther("0.001");
      await s.xns.connect(s.user1).registerPublicNamespace("gm", p, { value: fee });
      await time.increase((await s.xns.EXCLUSIVITY_PERIOD()) + 86400n);
      await s.xns.connect(s.user2).registerName("alice", "gm", { value: p });

      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await af("alice.gm")).to.equal(await getAddrFull("alice.gm"));
    });

    it("Should return address(0) for blocked suffix even if XNS has a registration", async function () {
      const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const p = ethers.parseEther("0.001");
      await s.xns.connect(s.user1).registerPublicNamespace("mega", p, { value: fee });
      await time.increase((await s.xns.EXCLUSIVITY_PERIOD()) + 86400n);
      await s.xns.connect(s.user2).registerName("carol", "mega", { value: p });

      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await getAddrFull("carol.mega")).to.equal(s.user2.address);
      expect(await af("carol.mega")).to.equal(ethers.ZeroAddress);
    });
  });

  describe("getAddress(label, namespace)", function () {
    let s: Fixture;

    beforeEach(async function () {
      s = await loadFixture(deployAdapterFixture);
    });

    it("Should return address(0) for namespace mega", async function () {
      const ap = adapterGetLabelNs(s.adapter);
      expect(await ap("any", "mega")).to.equal(ethers.ZeroAddress);
    });

    it("Should return address(0) for namespace wei", async function () {
      const ap = adapterGetLabelNs(s.adapter);
      expect(await ap("any", "wei")).to.equal(ethers.ZeroAddress);
    });

    it("Should forward empty namespace to XNS (bare name)", async function () {
      const barePrice = await s.xns.BARE_NAME_PRICE();
      await s.xns.connect(s.user2).registerName("dave", "x", { value: barePrice });
      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      expect(await ap("dave", "")).to.equal(await getAddr2("dave", ""));
    });

    it("Should forward other namespaces to XNS", async function () {
      const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const p = ethers.parseEther("0.001");
      await s.xns.connect(s.user1).registerPublicNamespace("gm", p, { value: fee });
      await time.increase((await s.xns.EXCLUSIVITY_PERIOD()) + 86400n);
      await s.xns.connect(s.user2).registerName("erin", "gm", { value: p });
      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      expect(await ap("erin", "gm")).to.equal(await getAddr2("erin", "gm"));
    });
  });

  describe("getName", function () {
    it("Should return empty string when XNS primary name ends with .mega", async function () {
      const s = await loadFixture(deployAdapterFixture);
      const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const p = ethers.parseEther("0.001");
      await s.xns.connect(s.user1).registerPublicNamespace("mega", p, { value: fee });
      await time.increase((await s.xns.EXCLUSIVITY_PERIOD()) + 86400n);
      await s.xns.connect(s.user2).registerName("frank", "mega", { value: p });

      expect(await s.xns.getName(s.user2.address)).to.equal("frank.mega");
      expect(await s.adapter.getName(s.user2.address)).to.equal("");
    });

    it("Should return empty string when XNS primary name ends with .wei", async function () {
      const s = await loadFixture(deployAdapterFixture);
      const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const p = ethers.parseEther("0.001");
      await s.xns.connect(s.user1).registerPublicNamespace("wei", p, { value: fee });
      await time.increase((await s.xns.EXCLUSIVITY_PERIOD()) + 86400n);
      await s.xns.connect(s.user2).registerName("grace", "wei", { value: p });

      expect(await s.xns.getName(s.user2.address)).to.equal("grace.wei");
      expect(await s.adapter.getName(s.user2.address)).to.equal("");
    });

    it("Should mirror XNS getName when not blocked", async function () {
      const s = await loadFixture(deployAdapterFixture);
      const fee = await s.xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
      const p = ethers.parseEther("0.001");
      await s.xns.connect(s.user1).registerPublicNamespace("gm", p, { value: fee });
      await time.increase((await s.xns.EXCLUSIVITY_PERIOD()) + 86400n);
      await s.xns.connect(s.user2).registerName("heidi", "gm", { value: p });

      expect(await s.adapter.getName(s.user2.address)).to.equal(await s.xns.getName(s.user2.address));
    });

    it("Should return empty when XNS returns empty", async function () {
      const s = await loadFixture(deployAdapterFixture);
      expect(await s.adapter.getName(s.user3.address)).to.equal("");
    });
  });

  describe("isBlockedNamespace", function () {
    let s: Fixture;

    beforeEach(async function () {
      s = await loadFixture(deployAdapterFixture);
    });

    it("Should return true for mega and wei", async function () {
      expect(await s.adapter.isBlockedNamespace("mega")).to.be.true;
      expect(await s.adapter.isBlockedNamespace("wei")).to.be.true;
    });

    it("Should return false for empty string and other namespaces", async function () {
      expect(await s.adapter.isBlockedNamespace("")).to.be.false;
      expect(await s.adapter.isBlockedNamespace("x")).to.be.false;
      expect(await s.adapter.isBlockedNamespace("eth")).to.be.false;
    });

    it("Should return false for uppercase MEGA / WEI (hash mismatch)", async function () {
      expect(await s.adapter.isBlockedNamespace("MEGA")).to.be.false;
      expect(await s.adapter.isBlockedNamespace("WEI")).to.be.false;
    });
  });
});
