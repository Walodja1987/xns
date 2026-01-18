/**
 * Script to query the XNS name for an address
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/getName.ts --network <network_name>`
 *
 * EXAMPLE:
 * To query a name on Sepolia:
 * `npx hardhat run scripts/examples/getName.ts --network sepolia`
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

// Address to query name for (null = use signer's address)
const addressToQuery: string | null = null;

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// Only used if addressToQuery is null
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

  // Get the address to query
  const signers = await hre.ethers.getSigners();
  const signer = signers[signerIndex];
  const address = addressToQuery ? addressToQuery : signer.address;

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Querying name for address: ${GREEN}${address}${RESET}\n`);

  // Query name
  const getName = xns.getFunction("getName(address)");
  const name = await getName(address);

  if (name === "") {
    console.log(`${YELLOW}⚠${RESET} Address ${address} has no registered XNS name\n`);
  } else {
    console.log(`${GREEN}✓${RESET} Found name: ${GREEN}${name}${RESET}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

