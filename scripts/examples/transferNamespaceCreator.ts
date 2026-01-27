/**
 * Script to initiate namespace creator transfer
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/transferNamespaceCreator.ts --network <network_name>`
 *
 * EXAMPLE:
 * To transfer namespace creator on Sepolia:
 * `npx hardhat run scripts/examples/transferNamespaceCreator.ts --network sepolia`
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

// Address of the new creator (must be a valid Ethereum address)
// Set to "0x0000000000000000000000000000000000000000" to cancel a pending transfer
// Set to null to use a signer address
const newCreatorAddress: string | null = null;

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// This account must be the current namespace creator
// Only used if newCreatorAddress is null
const signerIndex = 0;

// Index of signer to use as new creator (only used if newCreatorAddress is null)
// Set to 1 to use account 2, 2 to use account 3, etc.
const newCreatorSignerIndex = 1;

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
  const currentCreator = signers[signerIndex];

  // Determine new creator address
  const newCreator = newCreatorAddress
    ? newCreatorAddress
    : signers[newCreatorSignerIndex].address;

  // Validate new creator address (allow zero address for cancellation)
  if (newCreator !== hre.ethers.ZeroAddress && !hre.ethers.isAddress(newCreator)) {
    throw new Error(`Invalid new creator address: ${newCreator}`);
  }

  // Check if this is a cancellation
  const isCancellation = newCreator === hre.ethers.ZeroAddress;

  // Get namespace info to verify current creator
  const namespaceInfo = await xns.getNamespaceInfo(namespace);
  const currentCreatorAddress = namespaceInfo.creator;

  if (currentCreatorAddress === hre.ethers.ZeroAddress) {
    throw new Error(`Namespace "${namespace}" does not exist.`);
  }

  if (currentCreatorAddress.toLowerCase() !== currentCreator.address.toLowerCase()) {
    throw new Error(
      `Signer ${currentCreator.address} is not the current creator of namespace "${namespace}". Current creator is: ${currentCreatorAddress}`,
    );
  }

  // Check if there's already a pending creator
  const existingPendingCreator = await xns.getPendingNamespaceCreator(namespace);
  if (existingPendingCreator !== hre.ethers.ZeroAddress) {
    console.log(`${YELLOW}⚠${RESET} There is already a pending creator: ${existingPendingCreator}`);
    console.log(`${YELLOW}⚠${RESET} This transfer will overwrite the existing pending transfer\n`);
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Current creator: ${GREEN}${currentCreatorAddress}${RESET}`);
  if (isCancellation) {
    console.log(`Action: ${YELLOW}Cancelling pending namespace creator transfer${RESET}\n`);
  } else {
    console.log(`New creator: ${GREEN}${newCreator}${RESET}\n`);
  }

  // Initiate namespace creator transfer or cancellation
  if (isCancellation) {
    console.log(`Cancelling pending namespace creator transfer...\n`);
  } else {
    console.log(`Initiating namespace creator transfer...\n`);
  }

  const transferTx = await xns.connect(currentCreator).transferNamespaceCreator(namespace, newCreator);

  console.log(`Transaction hash: ${GREEN}${transferTx.hash}${RESET}\n`);

  console.log("Waiting for confirmation...\n");
  const receipt = await transferTx.wait();

  // Verify pending creator was set
  const pendingCreator = await xns.getPendingNamespaceCreator(namespace);
  const namespaceInfoAfter = await xns.getNamespaceInfo(namespace);
  const creatorAfter = namespaceInfoAfter.creator;

  if (isCancellation) {
    console.log(`\n${GREEN}✓ Pending namespace creator transfer cancelled successfully!${RESET}\n`);
    console.log(`Current creator: ${GREEN}${creatorAfter}${RESET} (unchanged)`);
    console.log(`Pending creator: ${GREEN}${pendingCreator}${RESET} (cleared)\n`);
  } else {
    console.log(`\n${GREEN}✓ Namespace creator transfer initiated successfully!${RESET}\n`);
    console.log(`Current creator: ${GREEN}${creatorAfter}${RESET} (unchanged)`);
    console.log(`Pending creator: ${GREEN}${pendingCreator}${RESET}`);
    console.log(
      `\n${YELLOW}⚠${RESET} The new creator (${pendingCreator}) must call acceptNamespaceCreator("${namespace}") to complete the transfer.\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

