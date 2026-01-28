/**
 * Script to initiate namespace ownership transfer
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/transferNamespaceOwnership.ts --network <network_name>`
 *
 * EXAMPLE:
 * To transfer namespace ownership on Sepolia:
 * `npx hardhat run scripts/examples/transferNamespaceOwnership.ts --network sepolia`
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

// Namespace to transfer (e.g., "xns", "yolo", etc.)
const namespace = "xns";

// Address of the new namespace owner (must be a valid Ethereum address)
// Set to "0x0000000000000000000000000000000000000000" to cancel a pending transfer
// Set to null to use a signer address
const newOwnerAddress: string | null = null;

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// This account must be the current namespace owner
// Only used if newOwnerAddress is null
const signerIndex = 0;

// Index of signer to use as new namespace owner (only used if newOwnerAddress is null)
// Set to 1 to use account 2, 2 to use account 3, etc.
const newOwnerSignerIndex = 1;

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

  // Get signers
  const signers = await hre.ethers.getSigners();
  const currentOwner = signers[signerIndex];

  // Determine new namespace owner address
  const newOwner = newOwnerAddress
    ? newOwnerAddress
    : signers[newOwnerSignerIndex].address;

  // Validate new namespace owner address (allow zero address for cancellation)
  if (newOwner !== hre.ethers.ZeroAddress && !hre.ethers.isAddress(newOwner)) {
    throw new Error(`Invalid new namespace owner address: ${newOwner}`);
  }

  // Check if this is a cancellation
  const isCancellation = newOwner === hre.ethers.ZeroAddress;

  // Get namespace info to verify current namespace owner
  const namespaceInfo = await xns.getNamespaceInfo(namespace);
  const currentOwnerAddress = namespaceInfo.owner;

  if (currentOwnerAddress === hre.ethers.ZeroAddress) {
    throw new Error(`Namespace "${namespace}" does not exist.`);
  }

  if (currentOwnerAddress.toLowerCase() !== currentOwner.address.toLowerCase()) {
    throw new Error(
      `Signer ${currentOwner.address} is not the current namespace owner of namespace "${namespace}". Current namespace owner is: ${currentOwnerAddress}`,
    );
  }

  // Check if there's already a pending namespace owner
  const existingPendingOwner = await xns.getPendingNamespaceOwner(namespace);
  if (existingPendingOwner !== hre.ethers.ZeroAddress) {
    console.log(`${YELLOW}⚠${RESET} There is already a pending namespace owner: ${existingPendingOwner}`);
    console.log(`${YELLOW}⚠${RESET} This transfer will overwrite the existing pending transfer\n`);
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Current namespace owner: ${GREEN}${currentOwnerAddress}${RESET}`);
  if (isCancellation) {
    console.log(`Action: ${YELLOW}Cancelling pending namespace ownership transfer${RESET}\n`);
  } else {
    console.log(`New namespace owner: ${GREEN}${newOwner}${RESET}\n`);
  }

  // Initiate namespace ownership transfer or cancellation
  if (isCancellation) {
    console.log(`Cancelling pending namespace ownership transfer...\n`);
  } else {
    console.log(`Initiating namespace ownership transfer...\n`);
  }

  const transferTx = await xns.connect(currentOwner).transferNamespaceOwnership(namespace, newOwner);

  console.log(`Transaction hash: ${GREEN}${transferTx.hash}${RESET}\n`);

  console.log("Waiting for confirmation...\n");
  const receipt = await transferTx.wait();

  // Verify pending namespace owner was set
  const pendingOwner = await xns.getPendingNamespaceOwner(namespace);
  const namespaceInfoAfter = await xns.getNamespaceInfo(namespace);
  const ownerAfter = namespaceInfoAfter.owner;

  if (isCancellation) {
    console.log(`\n${GREEN}✓ Pending namespace ownership transfer cancelled successfully!${RESET}\n`);
    console.log(`Current namespace owner: ${GREEN}${ownerAfter}${RESET} (unchanged)`);
    console.log(`Pending namespace owner: ${GREEN}${pendingOwner}${RESET} (cleared)\n`);
  } else {
    console.log(`\n${GREEN}✓ Namespace ownership transfer initiated successfully!${RESET}\n`);
    console.log(`Current namespace owner: ${GREEN}${ownerAfter}${RESET} (unchanged)`);
    console.log(`Pending namespace owner: ${GREEN}${pendingOwner}${RESET}`);
    console.log(
      `\n${YELLOW}⚠${RESET} The new namespace owner (${pendingOwner}) must call acceptNamespaceOwnership("${namespace}") to complete the transfer.\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

