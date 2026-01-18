/**
 * Script to query pending fees for an address on XNS
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/getPendingFees.ts --network <network_name>`
 *
 * EXAMPLE:
 * To query pending fees on Sepolia:
 * `npx hardhat run scripts/examples/getPendingFees.ts --network sepolia`
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
import { formatEther } from "ethers";
import { XNS_ADDRESS } from "../../constants/addresses";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Address to check pending fees for (null = use signer's address)
const addressToCheck: string | null = null;

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// Only used if addressToCheck is null
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

  // Get the address to check
  const signers = await hre.ethers.getSigners();
  const signer = signers[signerIndex];
  const address = addressToCheck ? addressToCheck : signer.address;

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Checking pending fees for: ${GREEN}${address}${RESET}\n`);

  // Query pending fees
  const getPendingFees = xns.getFunction("getPendingFees(address)");
  const pendingFees = await getPendingFees(address);

  console.log(`Pending fees: ${GREEN}${formatEther(pendingFees)} ETH${RESET}\n`);

  if (pendingFees === 0n) {
    console.log(`${YELLOW}⚠${RESET} No pending fees for ${address}\n`);
  } else {
    console.log(`${GREEN}✓${RESET} Found ${formatEther(pendingFees)} ETH in pending fees\n`);
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

