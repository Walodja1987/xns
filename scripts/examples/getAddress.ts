/**
 * Script to resolve an XNS name to an Ethereum address
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/getAddress.ts --network <network_name>`
 *
 * EXAMPLE:
 * To resolve a name on Sepolia:
 * `npx hardhat run scripts/examples/getAddress.ts --network sepolia`
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

// Option 1: Use separate label and namespace (recommended)
const label = "alice";
const namespace = "xns";

// Option 2: Use full name string (e.g., "vitalik", "bob", "alice.xns")
// Set to null to use label + namespace instead
const fullName: string | null = null;

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

  let nameToResolve: string;
  let address: string;

  // Use full name string if provided, otherwise use label + namespace
  if (fullName !== null) {
    nameToResolve = fullName;
    console.log(`Resolving full name: ${GREEN}${nameToResolve}${RESET}\n`);

    const getAddressFull = xns.getFunction("getAddress(string)");
    address = await getAddressFull(fullName);
  } else {
    nameToResolve = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;
    console.log(`Resolving name: ${GREEN}${nameToResolve}${RESET}`);
    console.log(`  Label: ${GREEN}${label}${RESET}`);
    console.log(`  Namespace: ${GREEN}${namespace}${RESET}\n`);

    const getAddress = xns.getFunction("getAddress(string,string)");
    address = await getAddress(label, namespace);
  }

  if (address === hre.ethers.ZeroAddress) {
    console.log(`${YELLOW}⚠${RESET} Name "${nameToResolve}" is not registered\n`);
  } else {
    console.log(`${GREEN}✓${RESET} Resolved to address: ${GREEN}${address}${RESET}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

