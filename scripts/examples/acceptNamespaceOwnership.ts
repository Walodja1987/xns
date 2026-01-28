/**
 * Script to accept namespace ownership transfer
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/acceptNamespaceOwnership.ts --network <network_name>`
 *
 * EXAMPLE:
 * To accept namespace ownership transfer on Sepolia:
 * `npx hardhat run scripts/examples/acceptNamespaceOwnership.ts --network sepolia`
 *
 * REQUIRED SETUP:
 * Before running, set these environment variables using hardhat-vars:
 *
 * 1. Network Independent Setup:
 *    - MNEMONIC:          `npx hardhat vars set MNEMONIC`
 *    - ETHERSCAN_API_KEY: `npx hardhat vars set ETHERSCAN_API_KEY`
 *
 * 2. Network Specific Setup:
 *    - ETH_SEPOLIA_TESTNET_URL: `npx hardhat vars set ETH_SEPOLIA_TESTNET_URL`
 */

import hre from "hardhat";
import { XNS_ADDRESS } from "../../constants/addresses";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Namespace to accept ownership transfer for (e.g., "xns", "yolo", etc.)
const namespace = "xns";

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// This account must be the pending namespace owner
const signerIndex = 0;

async function main() {
  const networkName = hre.network.name;

  // Get XNS address for the current network
  const contractAddress = XNS_ADDRESS[networkName];
  if (!contractAddress) {
    throw new Error(
      `XNS contract address not set for network: ${networkName}. Please add address to constants/addresses.ts`,
    );
  }

  // Get XNS contract instance
  const xns = await hre.ethers.getContractAt("XNS", contractAddress);

  // Get signer
  const signers = await hre.ethers.getSigners();
  const pendingOwner = signers[signerIndex];

  // Get namespace info to check current namespace owner
  const namespaceInfo = await xns.getNamespaceInfo(namespace);
  const currentOwner = namespaceInfo.owner;

  if (currentOwner === hre.ethers.ZeroAddress) {
    throw new Error(`Namespace "${namespace}" does not exist.`);
  }

  // Check pending namespace owner
  const pendingOwnerAddress = await xns.getPendingNamespaceOwner(namespace);
  if (pendingOwnerAddress === hre.ethers.ZeroAddress) {
    throw new Error(
      `No pending namespace ownership transfer for namespace "${namespace}". Namespace owner must call transferNamespaceOwnership() first.`,
    );
  }

  if (pendingOwnerAddress.toLowerCase() !== pendingOwner.address.toLowerCase()) {
    throw new Error(
      `Signer ${pendingOwner.address} is not the pending namespace owner of namespace "${namespace}". Pending namespace owner is: ${pendingOwnerAddress}`,
    );
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Current namespace owner: ${GREEN}${currentOwner}${RESET}`);
  console.log(`Pending namespace owner: ${GREEN}${pendingOwnerAddress}${RESET}\n`);

  // Accept namespace ownership transfer
  console.log(`Accepting namespace ownership transfer...\n`);

  const acceptTx = await xns.connect(pendingOwner).acceptNamespaceOwnership(namespace);

  console.log(`Transaction hash: ${GREEN}${acceptTx.hash}${RESET}\n`);

  console.log("Waiting for confirmation...\n");
  const receipt = await acceptTx.wait();

  // Verify namespace owner was transferred
  const namespaceInfoAfter = await xns.getNamespaceInfo(namespace);
  const newOwner = namespaceInfoAfter.owner;
  const pendingOwnerAfter = await xns.getPendingNamespaceOwner(namespace);

  console.log(`\n${GREEN}✓ Namespace ownership transfer completed successfully!${RESET}\n`);
  console.log(`Previous namespace owner: ${GREEN}${currentOwner}${RESET}`);
  console.log(`New namespace owner: ${GREEN}${newOwner}${RESET}`);
  console.log(`Pending namespace owner: ${GREEN}${pendingOwnerAfter}${RESET} (cleared)`);
  console.log(
    `\n${GREEN}✓${RESET} The new namespace owner now has full control of namespace "${namespace}".\n`,
  );
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

