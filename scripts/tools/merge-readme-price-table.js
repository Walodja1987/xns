#!/usr/bin/env node
/**
 * Merges scripts/tools/build-safe-namespace-batch.js DEFAULT_ENTRIES into README.md
 * price table (dedupe + sort namespaces per row). Inserts 0.050 ETH row if missing.
 *
 * Run: node scripts/tools/merge-readme-price-table.js
 *
 * This will overwrite the root README.md in place.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const batchPath = path.join(root, "scripts/tools/build-safe-namespace-batch.js");
const readmePath = path.join(root, "README.md");

const batchTxt = fs.readFileSync(batchPath, "utf8");
const arrMatch = batchTxt.match(/const DEFAULT_ENTRIES = (\[[\s\S]*?\n\]);/);
if (!arrMatch) throw new Error("DEFAULT_ENTRIES not found");
const DEFAULT_ENTRIES = eval(arrMatch[1]);

const byPrice = new Map();
for (const { namespace, priceEth } of DEFAULT_ENTRIES) {
  const p = parseFloat(priceEth);
  if (!byPrice.has(p)) byPrice.set(p, []);
  byPrice.get(p).push(namespace);
}

let readme = fs.readFileSync(readmePath, "utf8");

const sectionStart = readme.indexOf("## 🔥 XNS Price list");
const sectionEnd = readme.indexOf("> The \"x\" namespace");
if (sectionStart === -1 || sectionEnd === -1) throw new Error("README price section markers not found");

const tableBlock = readme.slice(sectionStart, sectionEnd);
const lines = tableBlock.split("\n");

const dataRows = [];
for (const line of lines) {
  const rm = line.match(/^\| (\d+\.\d{3}) ETH \| (.+) \| ([^|]*) \|$/);
  if (!rm) continue;
  dataRows.push({
    priceStr: rm[1],
    price: parseFloat(rm[1]),
    nsCell: rm[2],
    exCell: rm[3].trimEnd()
  });
}

function parseNamespaces(nsCell) {
  const out = [];
  const re = /`([^`]+)`/g;
  let x;
  while ((x = re.exec(nsCell))) out.push(x[1]);
  return out;
}

function formatNamespaces(names) {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "en")).map((n) => `\`${n}\``).join(", ");
}

const merged = dataRows.map((row) => {
  const existing = parseNamespaces(row.nsCell);
  const add = byPrice.get(row.price) || [];
  return {
    priceStr: row.priceStr,
    price: row.price,
    nsCell: formatNamespaces([...existing, ...add]),
    exCell: row.exCell
  };
});

if (byPrice.has(0.05) && !merged.some((r) => r.price === 0.05)) {
  const idx = merged.findIndex((r) => r.price > 0.05);
  const insertAt = idx === -1 ? merged.length : idx;
  merged.splice(insertAt, 0, {
    priceStr: "0.050",
    price: 0.05,
    nsCell: formatNamespaces(byPrice.get(0.05)),
    exCell: "-"
  });
}

const newTable =
  "## 🔥 XNS Price list\n\n" +
  "| Price | Namespaces | Example Names |\n" +
  "|---|---|---|\n" +
  merged.map((r) => `| ${r.priceStr} ETH | ${r.nsCell} | ${r.exCell} |`).join("\n") +
  "\n\n";

const out = readme.slice(0, sectionStart) + newTable + readme.slice(sectionEnd);
fs.writeFileSync(readmePath, out, "utf8");

console.error(`Wrote ${merged.length} price rows; batch tiers: ${byPrice.size}`);
