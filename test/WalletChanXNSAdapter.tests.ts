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
    user4: SignerWithAddress;
    user5: SignerWithAddress;
    user6: SignerWithAddress;
    user7: SignerWithAddress;
    user8: SignerWithAddress;
    user9: SignerWithAddress;
    priceXNSNs: bigint;
  }

  const PRICE_GM_MEGA_WEI = ethers.parseEther("0.001");

  /// XNS + DETH at hardcoded address, `xns` namespace registered, exclusivity elapsed — ready to deploy adapter with exact name fee.
  async function setupWithXNSNamespace(): Promise<Omit<Fixture, "adapter">> {
    const [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9] = await ethers.getSigners();

    const DETH_ADDRESS = "0xE46861C9f28c46F27949fb471986d59B256500a7";
    const dethDeployed = await ethers.deployContract("DETH");
    await dethDeployed.waitForDeployment();
    const dethBytecode = await ethers.provider.getCode(dethDeployed.target);
    await ethers.provider.send("hardhat_setCode", [DETH_ADDRESS, dethBytecode!]);

    const xns = await ethers.deployContract("XNS", [owner.address]);
    await xns.waitForDeployment();

    const namespaceFee = await xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
    await xns.connect(user1).registerPublicNamespace("xns", PRICE_GM_MEGA_WEI, { value: namespaceFee });

    await time.increase((await xns.EXCLUSIVITY_PERIOD()) + 86400n);

    const priceXNSNs = await xns.getNamespacePrice("xns");

    return { xns, owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, priceXNSNs };
  }

  async function deployAdapterOnly(base: Omit<Fixture, "adapter">): Promise<Fixture> {
    const adapter = await ethers.deployContract("WalletChanXNSAdapter", [await base.xns.getAddress()], {
      value: base.priceXNSNs,
    });
    await adapter.waitForDeployment();
    return { ...base, adapter };
  }

  async function deployAdapterFixture(): Promise<Fixture> {
    const base = await setupWithXNSNamespace();
    return deployAdapterOnly(base);
  }

  /// Adapter deployed + public namespaces mega / wei / gm, exclusivity elapsed, names registered (unique holder per name).
  async function deployAdapterWithRegistrationsFixture(): Promise<Fixture> {
    const base = await setupWithXNSNamespace();
    const s = await deployAdapterOnly(base);
    const { xns, user1, user2, user3, user4, user5, user6, user7, user8, user9 } = s;

    const fee = await xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();
    await xns.connect(user1).registerPublicNamespace("mega", PRICE_GM_MEGA_WEI, { value: fee });
    await xns.connect(user1).registerPublicNamespace("wei", PRICE_GM_MEGA_WEI, { value: fee });
    await xns.connect(user1).registerPublicNamespace("gm", PRICE_GM_MEGA_WEI, { value: fee });
    await time.increase((await xns.EXCLUSIVITY_PERIOD()) + 86400n);

    await xns.connect(user2).registerName("alice", "mega", { value: PRICE_GM_MEGA_WEI });
    await xns.connect(user3).registerName("a", "mega", { value: PRICE_GM_MEGA_WEI });
    await xns.connect(user4).registerName("bob", "wei", { value: PRICE_GM_MEGA_WEI });
    await xns.connect(user5).registerName("alice", "gm", { value: PRICE_GM_MEGA_WEI });
    await xns.connect(user6).registerName("erin", "gm", { value: PRICE_GM_MEGA_WEI });

    const barePrice = await xns.BARE_NAME_PRICE();
    await xns.connect(user7).registerName("mega", "x", { value: barePrice });
    await xns.connect(user8).registerName("wei", "x", { value: barePrice });
    await xns.connect(user9).registerName("dave", "x", { value: barePrice });

    return s;
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
      const base = await loadFixture(setupWithXNSNamespace);
      const tooLow = base.priceXNSNs > 0n ? base.priceXNSNs - 1n : 0n;
      await expect(
        ethers.deployContract("WalletChanXNSAdapter", [await base.xns.getAddress()], { value: tooLow }),
      ).to.be.reverted;
    });
  });

  describe("getAddress(fullName)", function () {
    let s: Fixture;

    beforeEach(async function () {
      s = await loadFixture(deployAdapterWithRegistrationsFixture);
    });

    it("Should mask .mega full names registered on XNS (XNS non-zero, adapter zero)", async function () {
      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await getAddrFull("alice.mega")).to.equal(s.user2.address);
      expect(await getAddrFull("a.mega")).to.equal(s.user3.address);
      expect(await af("alice.mega")).to.equal(ethers.ZeroAddress);
      expect(await af("a.mega")).to.equal(ethers.ZeroAddress);
    });

    it("Should mask .wei full names registered on XNS (XNS non-zero, adapter zero)", async function () {
      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await getAddrFull("bob.wei")).to.equal(s.user4.address);
      expect(await af("bob.wei")).to.equal(ethers.ZeroAddress);
    });

    it("Should forward fullName with uppercase .MEGA/.WEI; XNS and adapter are zero (namespace not registrable)", async function () {
      expect(await s.xns.isValidLabelOrNamespace("WEI")).to.be.false;
      expect(await s.xns.isValidLabelOrNamespace("MEGA")).to.be.false;

      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await getAddrFull("bob.WEI")).to.equal(ethers.ZeroAddress);
      expect(await getAddrFull("alice.MEGA")).to.equal(ethers.ZeroAddress);
      expect(await af("bob.WEI")).to.equal(ethers.ZeroAddress);
      expect(await af("alice.MEGA")).to.equal(ethers.ZeroAddress);
    });

    it("Should forward bare mega and wei to XNS (not blocked)", async function () {
      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await af("mega")).to.equal(await getAddrFull("mega"));
      expect(await af("wei")).to.equal(await getAddrFull("wei"));
      expect(await af("mega")).to.not.equal(ethers.ZeroAddress);
      expect(await af("wei")).to.not.equal(ethers.ZeroAddress);
    });

    it("Should forward non-blocked full names to XNS", async function () {
      const getAddrFull = s.xns.getFunction("getAddress(string)");
      const af = adapterGetFullName(s.adapter);
      expect(await af("alice.gm")).to.equal(await getAddrFull("alice.gm"));
      expect(await af("alice.gm")).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("getAddress(label, namespace)", function () {
    let s: Fixture;

    beforeEach(async function () {
      s = await loadFixture(deployAdapterWithRegistrationsFixture);
    });

    it("Should mask namespace mega when the name exists on XNS (XNS non-zero, adapter zero)", async function () {
      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      expect(await getAddr2("alice", "mega")).to.equal(s.user2.address);
      expect(await ap("alice", "mega")).to.equal(ethers.ZeroAddress);
    });

    it("Should mask namespace wei when the name exists on XNS (XNS non-zero, adapter zero)", async function () {
      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      expect(await getAddr2("bob", "wei")).to.equal(s.user4.address);
      expect(await ap("bob", "wei")).to.equal(ethers.ZeroAddress);
    });

    it("Should forward uppercase MEGA/WEI namespace to XNS; XNS and adapter are zero (namespace not registrable)", async function () {
      expect(await s.xns.isValidLabelOrNamespace("WEI")).to.be.false;
      expect(await s.xns.isValidLabelOrNamespace("MEGA")).to.be.false;

      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      expect(await getAddr2("any", "WEI")).to.equal(ethers.ZeroAddress);
      expect(await getAddr2("any", "MEGA")).to.equal(ethers.ZeroAddress);
      expect(await ap("any", "WEI")).to.equal(ethers.ZeroAddress);
      expect(await ap("any", "MEGA")).to.equal(ethers.ZeroAddress);
    });

    it("Should forward empty namespace to XNS (bare name); explicit `x` matches empty", async function () {
      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      const xnsEmpty = await getAddr2("dave", "");
      expect(await ap("dave", "")).to.equal(xnsEmpty);
      expect(xnsEmpty).to.not.equal(ethers.ZeroAddress);

      expect(await getAddr2("dave", "x")).to.equal(xnsEmpty);
      expect(await ap("dave", "x")).to.equal(await getAddr2("dave", "x"));
      expect(await ap("dave", "x")).to.equal(await ap("dave", ""));
    });

    it("Should forward other namespaces to XNS", async function () {
      const getAddr2 = s.xns.getFunction("getAddress(string,string)");
      const ap = adapterGetLabelNs(s.adapter);
      expect(await ap("erin", "gm")).to.equal(await getAddr2("erin", "gm"));
      expect(await ap("erin", "gm")).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("getName", function () {
    let s: Fixture;

    beforeEach(async function () {
      s = await loadFixture(deployAdapterWithRegistrationsFixture);
    });

    it("Should return empty string when XNS primary name ends with .mega", async function () {
      expect(await s.xns.getName(s.user2.address)).to.equal("alice.mega");
      expect(await s.adapter.getName(s.user2.address)).to.equal("");
    });

    it("Should return empty string when XNS primary name ends with .wei", async function () {
      expect(await s.xns.getName(s.user4.address)).to.equal("bob.wei");
      expect(await s.adapter.getName(s.user4.address)).to.equal("");
    });

    it("Should mirror XNS getName when not blocked", async function () {
      expect(await s.xns.getName(s.user5.address)).to.not.equal("");
      expect(await s.adapter.getName(s.user5.address)).to.equal(await s.xns.getName(s.user5.address));
    });

    it("Should return empty when XNS returns empty", async function () {
      expect(await s.xns.getName(s.owner.address)).to.equal("");
      expect(await s.adapter.getName(s.owner.address)).to.equal("");
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
      expect(await s.adapter.isBlockedNamespace("eth")).to.be.false; // eth is blocked inside XNS though
    });

    it("Should return false for uppercase MEGA / WEI (hash mismatch)", async function () {
      expect(await s.adapter.isBlockedNamespace("MEGA")).to.be.false;
      expect(await s.adapter.isBlockedNamespace("WEI")).to.be.false;
    });
  });
});
