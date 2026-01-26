/**
 * Script to accept ownership transfer of the XNS contract
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/acceptOwnership.ts --network <network_name>`
 *
 * EXAMPLE:
 * To accept ownership on Sepolia:
 * `npx hardhat run scripts/examples/acceptOwnership.ts --network sepolia`
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

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
// This account must be the pending owner
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
  const pendingOwner = signers[signerIndex];

  // Check current owner
  const currentOwner = await xns.owner();

  // Check pending owner
  const pendingOwnerAddress = await xns.pendingOwner();
  if (pendingOwnerAddress === hre.ethers.ZeroAddress) {
    throw new Error("No pending ownership transfer. Owner must call transferOwnership() first.");
  }

  if (pendingOwnerAddress.toLowerCase() !== pendingOwner.address.toLowerCase()) {
    throw new Error(
      `Signer ${pendingOwner.address} is not the pending owner. Pending owner is: ${pendingOwnerAddress}`,
    );
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Current owner: ${GREEN}${currentOwner}${RESET}`);
  console.log(`Pending owner: ${GREEN}${pendingOwnerAddress}${RESET}\n`);

  // Accept ownership
  console.log(`Accepting ownership transfer...\n`);

  const acceptTx = await xns.connect(pendingOwner).acceptOwnership();

  console.log(`Transaction hash: ${GREEN}${acceptTx.hash}${RESET}\n`);

  console.log("Waiting for confirmation...\n");
  const receipt = await acceptTx.wait();

  // Verify ownership was transferred
  const newOwner = await xns.owner();
  const pendingOwnerAfter = await xns.pendingOwner();

  console.log(`\n${GREEN}✓ Ownership transfer completed successfully!${RESET}\n`);
  console.log(`Previous owner: ${GREEN}${currentOwner}${RESET}`);
  console.log(`New owner: ${GREEN}${newOwner}${RESET}`);
  console.log(`Pending owner: ${GREEN}${pendingOwnerAfter}${RESET} (cleared)`);
  console.log(`\n${GREEN}✓${RESET} The new owner now has full control of the contract.\n`);
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

