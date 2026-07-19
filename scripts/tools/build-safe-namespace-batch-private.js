#!/usr/bin/env node

/**
 * Builds Safe Transaction Builder JSON for a multisig batch: one `registerPrivateNamespaceFor`
 * call per entry in `DEFAULT_ENTRIES`, for import into Safe (batch private namespace registration).
 *
 * Run: node scripts/tools/build-safe-namespace-batch-private.js
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const DEFAULT_SAFE_ADDRESS = "0xEd5356Cf46b7cFfbA4ae0bF804E5C810e60e00CC";
const DEFAULT_XNS_ADDRESS = "0x648E4F05aF2b7eB85109A8dc8AE81D8E006457D8";
const DEFAULT_NS_OWNER = "0x6548A3d2fdBE2f7637Fb4Bc4D64AeE17f63d7Da8";
const DEFAULT_CHAIN_ID = "1";
const DEFAULT_OUTPUT = path.join(root, "scripts/tools/out/new-private-namespaces.json");

// Namespaces to register (all private, minimum price 0.005 ETH)
const DEFAULT_ENTRIES = [
  ".bloodstones", ".paretos", ".reapers", ".mythics", ".dawns",
  ".stargazers", ".arcanes", ".runics", ".holies", ".trinities",
  ".divisions", ".sovereigns", ".emperors", ".archs", ".arche",
  ".arches", ".justicars", ".divisions0", ".divisions1", ".divisions2",
  ".divisions3", ".divisions4", ".divisions5", ".divisions6", ".divisions7",
  ".thetrinities", ".aethers", ".aethergem", ".aethergems", ".eminencecrest",
  ".eminencecrests", ".arcanics", ".justices", ".viceroys", ".vice",
  ".vices", ".celestials", ".primordials", ".divines", ".empyreans",
  ".chaoses", ".chaosed", ".mages", ".magics", ".magicians",
  ".triarchies", ".dragoneggs", ".flames", ".fires", ".honorarium",
  ".honoraries", ".honor", ".honors", ".lucids", ".limbos",
  ".limboed", ".spirited", ".fractaled", ".crested", ".throned",
  ".cherubims", ".orbed", ".gods", ".beaconed", ".sig",
  ".signal", ".sigil", ".sigils", ".seal", ".seals",
  ".sealed", ".oath", ".oaths", ".ignite", ".ignites",
  ".ascend", ".ascends", ".ascension", ".ascended", ".aegises",
  ".aegide", ".aegides", ".elis", ".elys", ".tries",
  ".tris", ".lucifiers", ".grimoires", ".tempests", ".valkyries",
  ".voidstars", ".reveried", ".elm", ".elms", ".elmed",
  ".crowns", ".queens", ".kings", ".seraphs", ".angelica",
  ".angela", ".angelas", ".fanoras", ".phanoras", ".athena",
  ".artemis", ".hecate", ".malefic", ".malefics", ".maleficdoll",
  ".maleficdolls", ".war", ".wars", ".warring", ".warpath",
  ".warpaths", ".crystals"
].map(ns => ({ namespace: ns, priceEth: "0.005" }));

function ethToWeiString(ethStr) {
  if (!/^\d+(\.\d+)?$/.test(ethStr)) {
    throw new Error(`Invalid ETH amount "${ethStr}"`);
  }
  const [whole, fracRaw = ""] = ethStr.split(".");
  const frac = (fracRaw + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac);
  return wei.toString();
}

function normalizeNamespace(ns) {
  return String(ns).trim().replace(/^\./, "");
}

function ensureNoDuplicates(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const ns = normalizeNamespace(entry.namespace).toLowerCase();
    if (seen.has(ns)) throw new Error(`Duplicate namespace in input: ${entry.namespace}`);
    seen.add(ns);
  }
}

function buildBatch() {
  const txTemplateInputs = [
    { internalType: "address", name: "nsOwner", type: "address" },
    { internalType: "string", name: "namespace", type: "string" },
    { internalType: "uint256", name: "pricePerName", type: "uint256" }
  ];

  const transactions = DEFAULT_ENTRIES.map(({ namespace, priceEth }) => ({
    to: DEFAULT_XNS_ADDRESS,
    value: "0",
    data: null,
    contractMethod: {
      inputs: txTemplateInputs,
      name: "registerPrivateNamespaceFor",
      payable: false
    },
    contractInputsValues: {
      nsOwner: DEFAULT_NS_OWNER,
      namespace: normalizeNamespace(namespace),
      pricePerName: ethToWeiString(String(priceEth))
    }
  }));

  return {
    version: "1.0",
    chainId: DEFAULT_CHAIN_ID,
    createdAt: Date.now(),
    meta: {
      name: "Transactions Batch",
      description: "Private namespace batch generated from DEFAULT_ENTRIES",
      txBuilderVersion: "1.18.3",
      createdFromSafeAddress: DEFAULT_SAFE_ADDRESS,
      createdFromOwnerAddress: "",
      checksum: ""
    },
    transactions
  };
}

function main() {
  ensureNoDuplicates(DEFAULT_ENTRIES);
  const output = DEFAULT_OUTPUT;
  const batch = buildBatch();

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(batch, null, 2)}\n`, "utf8");

  console.log(`Wrote ${batch.transactions.length} txs to ${output}`);
}

main();
