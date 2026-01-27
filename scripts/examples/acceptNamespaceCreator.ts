/**
 * Script to accept namespace creator transfer
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/acceptNamespaceCreator.ts --network <network_name>`
 *
 * EXAMPLE:
 * To accept namespace creator transfer on Sepolia:
 * `npx hardhat run scripts/examples/acceptNamespaceCreator.ts --network sepolia`
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

// Namespace to accept creator transfer for (e.g., "xns", "yolo", etc.)
const namespace = "xns";

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// This account must be the pending namespace creator
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
  const pendingCreator = signers[signerIndex];

  // Get namespace info to check current creator
  const namespaceInfo = await xns.getNamespaceInfo(namespace);
  const currentCreator = namespaceInfo.creator;

  if (currentCreator === hre.ethers.ZeroAddress) {
    throw new Error(`Namespace "${namespace}" does not exist.`);
  }

  // Check pending creator
  const pendingCreatorAddress = await xns.getPendingNamespaceCreator(namespace);
  if (pendingCreatorAddress === hre.ethers.ZeroAddress) {
    throw new Error(
      `No pending namespace creator transfer for namespace "${namespace}". Creator must call transferNamespaceCreator() first.`,
    );
  }

  if (pendingCreatorAddress.toLowerCase() !== pendingCreator.address.toLowerCase()) {
    throw new Error(
      `Signer ${pendingCreator.address} is not the pending creator of namespace "${namespace}". Pending creator is: ${pendingCreatorAddress}`,
    );
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Current creator: ${GREEN}${currentCreator}${RESET}`);
  console.log(`Pending creator: ${GREEN}${pendingCreatorAddress}${RESET}\n`);

  // Accept namespace creator transfer
  console.log(`Accepting namespace creator transfer...\n`);

  const acceptTx = await xns.connect(pendingCreator).acceptNamespaceCreator(namespace);

  console.log(`Transaction hash: ${GREEN}${acceptTx.hash}${RESET}\n`);

  console.log("Waiting for confirmation...\n");
  const receipt = await acceptTx.wait();

  // Verify namespace creator was transferred
  const namespaceInfoAfter = await xns.getNamespaceInfo(namespace);
  const newCreator = namespaceInfoAfter.creator;
  const pendingCreatorAfter = await xns.getPendingNamespaceCreator(namespace);

  console.log(`\n${GREEN}✓ Namespace creator transfer completed successfully!${RESET}\n`);
  console.log(`Previous creator: ${GREEN}${currentCreator}${RESET}`);
  console.log(`New creator: ${GREEN}${newCreator}${RESET}`);
  console.log(`Pending creator: ${GREEN}${pendingCreatorAfter}${RESET} (cleared)`);
  console.log(
    `\n${GREEN}✓${RESET} The new creator now has full control of namespace "${namespace}".\n`,
  );
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

