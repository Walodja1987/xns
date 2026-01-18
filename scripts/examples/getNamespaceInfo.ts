/**
 * Script to query namespace information on XNS
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/getNamespaceInfo.ts --network <network_name>`
 *
 * EXAMPLE:
 * To query namespace info on Sepolia:
 * `npx hardhat run scripts/examples/getNamespaceInfo.ts --network sepolia`
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

// Namespace to query (e.g., "xns", "001", etc.)
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
  console.log(`Querying namespace: ${GREEN}${namespace}${RESET}\n`);

  // Query namespace info
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  try {
    const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfo(namespace);

    console.log(`${GREEN}✓${RESET} Namespace found!\n`);
    console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
    console.log(`Price per name: ${GREEN}${formatEther(pricePerName)} ETH${RESET}`);
    console.log(`Creator: ${GREEN}${creator}${RESET}`);
    
    const createdAtDate = new Date(Number(createdAt) * 1000);
    console.log(
      `Created at: ${GREEN}${createdAt}${RESET} [${createdAtDate.toLocaleString()}]`
    );
    console.log(`Type: ${GREEN}${isPrivate ? "Private" : "Public"}${RESET}\n`);
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

