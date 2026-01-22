/**
 * Script to check if a namespace is within its exclusivity period on XNS
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/isInExclusivityPeriod.ts --network <network_name>`
 *
 * EXAMPLE:
 * To check exclusivity period on Sepolia:
 * `npx hardhat run scripts/examples/isInExclusivityPeriod.ts --network sepolia`
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
const BLUE = "\x1b[34m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Namespace to check (e.g., "xns", "001", "my-namespace", etc.)
const namespace = "xns";

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
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Checking namespace: ${GREEN}${namespace}${RESET}\n`);

  // Check if namespace is in exclusivity period
  const isInExclusivityPeriod = xns.getFunction("isInExclusivityPeriod(string)");
  try {
    const inExclusivityPeriod = await isInExclusivityPeriod(namespace);

    // Get namespace info for additional context
    const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
    const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfo(namespace);

    const exclusivityPeriod = await xns.EXCLUSIVITY_PERIOD();
    const exclusivityPeriodDays = Number(exclusivityPeriod) / 86400; // Convert seconds to days

    console.log(`${GREEN}✓${RESET} Namespace found!\n`);
    console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
    console.log(`Type: ${GREEN}${isPrivate ? "Private" : "Public"}${RESET}`);
    
    if (inExclusivityPeriod) {
      console.log(`Exclusivity period: ${BLUE}${GREEN}ACTIVE${RESET} (within ${exclusivityPeriodDays} days after creation)`);
      console.log(`${YELLOW}⚠${RESET} Only the namespace creator can register/sponsor names during this period.`);
    } else {
      console.log(`Exclusivity period: ${GREEN}ENDED${RESET} (${exclusivityPeriodDays} days have passed since creation)`);
      if (!isPrivate) {
        console.log(`${GREEN}✓${RESET} Public namespace is now open for anyone to register names.`);
      }
    }

    const createdAtDate = new Date(Number(createdAt) * 1000);
    const exclusivityEndDate = new Date((Number(createdAt) + Number(exclusivityPeriod)) * 1000);
    console.log(`\nCreated at: ${GREEN}${createdAtDate.toLocaleString()}${RESET}`);
    if (inExclusivityPeriod) {
      console.log(`Exclusivity ends: ${GREEN}${exclusivityEndDate.toLocaleString()}${RESET}`);
    } else {
      console.log(`Exclusivity ended: ${GREEN}${exclusivityEndDate.toLocaleString()}${RESET}`);
    }
    console.log();
  } catch (error) {
    console.log(
      `${YELLOW}⚠${RESET} Namespace "${namespace}" does not exist or an error occurred\n`,
    );
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

