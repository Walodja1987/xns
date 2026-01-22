/**
 * Script to register a public namespace on XNS
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/registerPublicNamespace.ts --network <network_name>`
 *
 * EXAMPLE:
 * To register a public namespace on Sepolia:
 * `npx hardhat run scripts/examples/registerPublicNamespace.ts --network sepolia`
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
 *
 * NOTE:
 * - This script always requires the full fee payment (50 ETH) for self-service registration
 * - Owner must use registerPublicNamespaceFor for free onboarding registrations
 */

import hre from "hardhat";
import { formatEther, parseEther } from "ethers";
import { XNS_ADDRESS } from "../../constants/addresses";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Namespace to register (e.g., "yolo", "ape", "100x")
const namespace = "my-public-namespace";

// Price per name in ETH (must be multiple of 0.001 ETH)
const pricePerNameETH = "0.001";

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
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
  const signer = signers[signerIndex];

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Registering with account: ${GREEN}${signer.address}${RESET}\n`);

  // Check if namespace already exists
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  try {
    await getNamespaceInfo(namespace);
    throw new Error(`Namespace "${namespace}" already exists`);
  } catch (error: unknown) {
    // If error message doesn't contain "namespace not found", rethrow
    if (error instanceof Error && !error.message.includes("namespace not found")) {
      throw error;
    }
    // Otherwise, namespace doesn't exist, which is what we want
  }

  // Get required fee
  const registrationFee = await xns.PUBLIC_NAMESPACE_REGISTRATION_FEE();

  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Type: ${GREEN}public${RESET}`);
  console.log(`Price per name: ${GREEN}${pricePerNameETH} ETH${RESET}`);
  console.log(`Registration fee: ${GREEN}${formatEther(registrationFee)} ETH${RESET}`);
  console.log(`Namespace creator: ${GREEN}${signer.address}${RESET}\n`);

  // Note: Owner must use registerPublicNamespaceFor for free onboarding registrations
  // This script always requires the full fee payment for self-service registration

  // Check signer balance
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log(
    `Account balance: ${GREEN}${formatEther(balance)} ETH${RESET}\n`,
  );

  if (balance < registrationFee) {
    throw new Error(
      `Insufficient balance. Need ${formatEther(registrationFee)} ETH, but have ${formatEther(balance)} ETH`,
    );
  }

  // Convert price to wei
  const pricePerName = parseEther(pricePerNameETH);

  // Register namespace
  console.log(`Registering public namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Sending ${GREEN}${formatEther(registrationFee)} ETH${RESET}...\n`);

  const registerTx = await xns.connect(signer).registerPublicNamespace(namespace, pricePerName, {
    value: registrationFee,
  });

  console.log(
    `Transaction hash: ${GREEN}${registerTx.hash}${RESET}\n`,
  );

  console.log("Waiting for confirmation...\n");
  const receipt = await registerTx.wait();

  // Verify registration
  const [returnedPrice, creator, createdAt, isPrivateReturned] = await getNamespaceInfo(namespace);

  console.log(`\n${GREEN}✓ Namespace registration successful!${RESET}\n`);
  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Type: ${GREEN}${isPrivateReturned ? "private" : "public"}${RESET}`);
  console.log(`Price per name: ${GREEN}${formatEther(returnedPrice)} ETH${RESET}`);
  console.log(`Creator: ${GREEN}${creator}${RESET}`);
  console.log(`Created at: ${GREEN}${new Date(Number(createdAt) * 1000).toISOString()}${RESET}\n`);

  // Check balance after
  const balanceAfter = await hre.ethers.provider.getBalance(signer.address);
  console.log(
    `Account balance after: ${GREEN}${formatEther(balanceAfter)} ETH${RESET}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

