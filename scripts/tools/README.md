# Namespace tooling

Small Node helpers for maintaining the XNS public namespace list in the repo root [`README.md`](../../README.md) and preparing Safe multisig batches.

Generated files are written under [`out/`](./out/); that directory is gitignored except [`out/.gitignore`](./out/.gitignore).

## Scripts

### `build-safe-namespace-batch.js`

Builds **Safe Transaction Builder** JSON: one `registerPublicNamespaceFor` transaction per `{ namespace, priceEth }` in `DEFAULT_ENTRIES`, for batch import into a Safe.

- **Run:** `node scripts/tools/build-safe-namespace-batch.js`
- **Default output:** `scripts/tools/out/new-namespaces.json`
- Edit `DEFAULT_ENTRIES`, addresses, and chain id at the top of the file as needed.

### `merge-readme-price-table.js`

Merges **`DEFAULT_ENTRIES` from `build-safe-namespace-batch.js`** into the README **“XNS Price list”** table: adds namespaces on the matching price row, dedupes and sorts names, and can insert a **0.050 ETH** row if the batch uses that tier but the table has no such row. **Overwrites `README.md`** in place.

- **Run:** `node scripts/tools/merge-readme-price-table.js`
- **Typical flow:** update `DEFAULT_ENTRIES` in the batch script → run merge → review `README.md`.

### `readme-namespaces-to-md-table.js`

Reads the README price-list section and writes a **flat** markdown table (`| Namespace | Price (ETH) |`), one row per namespace, sorted by price then name. Useful for diffing or exporting the list.

- **Run:** `node scripts/tools/readme-namespaces-to-md-table.js [output.md]`
- **Default output:** `scripts/tools/out/readme-namespaces-from-readme.md`
