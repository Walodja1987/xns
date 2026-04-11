#!/usr/bin/env node
/**
 * Parses the XNS price table in README.md and writes a flat markdown table:
 *   | Namespace | Price (ETH) |
 * One row per namespace, sorted by price then name.
 *
 * Run: node scripts/tools/readme-namespaces-to-md-table.js [output.md]
 * Default output: scripts/tools/out/readme-namespaces-from-readme.md
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const readmePath = path.join(root, "README.md");
const defaultOut = path.join(root, "scripts/tools/out/readme-namespaces-from-readme.md");

function parseReadmeTable(readme) {
  const sectionStart = readme.indexOf("## 🔥 XNS Price list");
  const sectionEnd = readme.indexOf("> The \"x\" namespace");
  if (sectionStart === -1 || sectionEnd === -1) {
    throw new Error("README price section markers not found (## 🔥 XNS Price list … > The \"x\" namespace)");
  }

  const tableBlock = readme.slice(sectionStart, sectionEnd);
  const entries = [];

  for (const line of tableBlock.split("\n")) {
    const rm = line.match(/^\| (\d+\.\d{3}) ETH \| (.+) \| ([^|]*) \|$/);
    if (!rm) continue;

    const priceStr = rm[1];
    const nsCell = rm[2];
    const re = /`([^`]+)`/g;
    let m;
    while ((m = re.exec(nsCell))) {
      entries.push({ namespace: m[1], priceEth: priceStr });
    }
  }

  return entries;
}

function escapeMdCell(s) {
  return String(s).replace(/\|/g, "\\|");
}

function buildMarkdown(entries) {
  const sorted = [...entries].sort((a, b) => {
    const pa = parseFloat(a.priceEth);
    const pb = parseFloat(b.priceEth);
    if (pa !== pb) return pa - pb;
    return a.namespace.localeCompare(b.namespace, "en");
  });

  const lines = [
    "# XNS public namespaces (from README.md)",
    "",
    `Generated from the [XNS price list](../../../README.md#-xns-price-list). **${sorted.length}** namespaces.`,
    "",
    "| Namespace | Price (ETH) |",
    "|---|---|"
  ];

  for (const { namespace, priceEth } of sorted) {
    lines.push(`| \`${escapeMdCell(namespace)}\` | ${priceEth} |`);
  }

  lines.push("");
  return lines.join("\n");
}

function main() {
  const outPath = path.resolve(process.argv[2] || defaultOut);
  const readme = fs.readFileSync(readmePath, "utf8");
  const entries = parseReadmeTable(readme);

  if (entries.length === 0) {
    throw new Error("No namespaces parsed; check README.md table format.");
  }

  const md = buildMarkdown(entries);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, "utf8");

  console.log(`Wrote ${entries.length} rows to ${outPath}`);
}

main();
