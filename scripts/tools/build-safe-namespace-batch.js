#!/usr/bin/env node

/**
 * Builds Safe Transaction Builder JSON for a multisig batch: one `registerPublicNamespaceFor`
 * call per entry in `DEFAULT_ENTRIES`, for import into Safe (batch public namespace registration).
 *
 * Run: node scripts/tools/build-safe-namespace-batch.js
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const DEFAULT_SAFE_ADDRESS = "0xEd5356Cf46b7cFfbA4ae0bF804E5C810e60e00CC"; // 0x423D5Bb054d766A428546Ff8dFB41CD4021D2568 for coc and chess; 0xD4077b68fEEDa49C705FD9219aa871b5f6faA710 for usd
const DEFAULT_XNS_ADDRESS = "0x648E4F05aF2b7eB85109A8dc8AE81D8E006457D8";
const DEFAULT_CHAIN_ID = "1";
const DEFAULT_OUTPUT = path.join(root, "scripts/tools/out/new-namespaces.json");

// Namespaces to register
const DEFAULT_ENTRIES = [
  { namespace: "coc", priceEth: "0.008" },
{ namespace: "chess", priceEth: "0.004" },
{ namespace: "rug", priceEth: "0.003" },
{ namespace: "hulk", priceEth: "0.003" },
{ namespace: "usd", priceEth: "0.002" },
{ namespace: "energy", priceEth: "0.001" },
{ namespace: "pwned", priceEth: "0.001" }
];

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
      name: "registerPublicNamespaceFor",
      payable: false
    },
    contractInputsValues: {
      nsOwner: DEFAULT_SAFE_ADDRESS,
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
      description: "Namespace batch generated from DEFAULT_ENTRIES",
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
