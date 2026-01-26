/**
 * Script to query the pending owner of the XNS contract
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/pendingOwner.ts --network <network_name>`
 *
 * EXAMPLE:
 * To query the pending owner on Sepolia:
 * `npx hardhat run scripts/examples/pendingOwner.ts --network sepolia`
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

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}\n`);

  // Query pending owner
  const pendingOwner = await xns.pendingOwner();

  if (pendingOwner === hre.ethers.ZeroAddress) {
    console.log(`Pending owner: ${YELLOW}None (zero address)${RESET}`);
    console.log(`${GREEN}✓${RESET} No pending ownership transfer\n`);
  } else {
    console.log(`Pending owner: ${GREEN}${pendingOwner}${RESET}`);
    console.log(`${YELLOW}⚠${RESET} Ownership transfer is pending. Pending owner must call acceptOwnership() to complete the transfer.\n`);
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

