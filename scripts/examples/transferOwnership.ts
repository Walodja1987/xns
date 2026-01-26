/**
 * Script to initiate ownership transfer of the XNS contract
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/transferOwnership.ts --network <network_name>`
 *
 * EXAMPLE:
 * To transfer ownership on Sepolia:
 * `npx hardhat run scripts/examples/transferOwnership.ts --network sepolia`
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

// Address of the new owner (must be a valid Ethereum address)
// Set to "0x0000000000000000000000000000000000000000" to cancel a pending transfer
// Set to null to use a signer address
const newOwnerAddress: string | null = null;

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// This account must be the current owner
// Only used if newOwnerAddress is null
const signerIndex = 0;

// Index of signer to use as new owner (only used if newOwnerAddress is null)
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

  // Determine new owner address
  const newOwner = newOwnerAddress
    ? newOwnerAddress
    : signers[newOwnerSignerIndex].address;

  // Validate new owner address (allow zero address for cancellation)
  if (newOwner !== hre.ethers.ZeroAddress && !hre.ethers.isAddress(newOwner)) {
    throw new Error(`Invalid new owner address: ${newOwner}`);
  }

  // Check if this is a cancellation
  const isCancellation = newOwner === hre.ethers.ZeroAddress;

  // Check current owner
  const currentOwnerAddress = await xns.owner();
  if (currentOwnerAddress.toLowerCase() !== currentOwner.address.toLowerCase()) {
    throw new Error(
      `Signer ${currentOwner.address} is not the current owner. Current owner is: ${currentOwnerAddress}`,
    );
  }

  // Check if there's already a pending owner
  const existingPendingOwner = await xns.pendingOwner();
  if (existingPendingOwner !== hre.ethers.ZeroAddress) {
    console.log(`${YELLOW}⚠${RESET} There is already a pending owner: ${existingPendingOwner}`);
    console.log(`${YELLOW}⚠${RESET} This transfer will overwrite the existing pending transfer\n`);
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Current owner: ${GREEN}${currentOwnerAddress}${RESET}`);
  if (isCancellation) {
    console.log(`Action: ${YELLOW}Cancelling pending ownership transfer${RESET}\n`);
  } else {
    console.log(`New owner: ${GREEN}${newOwner}${RESET}\n`);
  }

  // Initiate ownership transfer or cancellation
  if (isCancellation) {
    console.log(`Cancelling pending ownership transfer...\n`);
  } else {
    console.log(`Initiating ownership transfer...\n`);
  }

  const transferTx = await xns.connect(currentOwner).transferOwnership(newOwner);

  console.log(`Transaction hash: ${GREEN}${transferTx.hash}${RESET}\n`);

  console.log("Waiting for confirmation...\n");
  const receipt = await transferTx.wait();

  // Verify pending owner was set
  const pendingOwner = await xns.pendingOwner();
  const ownerAfter = await xns.owner();

  if (isCancellation) {
    console.log(`\n${GREEN}✓ Pending ownership transfer cancelled successfully!${RESET}\n`);
    console.log(`Current owner: ${GREEN}${ownerAfter}${RESET} (unchanged)`);
    console.log(`Pending owner: ${GREEN}${pendingOwner}${RESET} (cleared)\n`);
  } else {
    console.log(`\n${GREEN}✓ Ownership transfer initiated successfully!${RESET}\n`);
    console.log(`Current owner: ${GREEN}${ownerAfter}${RESET} (unchanged)`);
    console.log(`Pending owner: ${GREEN}${pendingOwner}${RESET}`);
    console.log(
      `\n${YELLOW}⚠${RESET} The new owner (${pendingOwner}) must call acceptOwnership() to complete the transfer.\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

