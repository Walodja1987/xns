/**
 * Script to register a name on XNS using registerName
 *
 * NOTE:
 * - This script uses `registerName`, which only works for public namespaces
 *   after the exclusivity period (30 days after namespace creation on Ethereum Mainnet).
 * - For private namespaces or during exclusivity period, use
 *   `registerNameWithAuthorization` instead (see registerNameWithAuthorization.ts).
 * - The script will validate these conditions and throw an error if they're not met.
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/registerName.ts --network <network_name>`
 *
 * EXAMPLE:
 * To register a name on Sepolia:
 * `npx hardhat run scripts/examples/registerName.ts --network sepolia`
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

// Label to register (e.g., "alice", "bob", "vitalik")
const label = "xns-deployer";

// Namespace (e.g., "xns", "x" for bare names, "001", etc.)
const namespace = "xns";

// Signer index (0 = account 1, 1 = account 2, 2 = account 3, etc.)
const signerIndex = 2;

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

  // Get namespace info to determine price and validate usage
  console.log(`Fetching namespace info for "${namespace}"...\n`);
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfo(namespace);

  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Price per name: ${GREEN}${formatEther(pricePerName)} ETH${RESET}`);
  console.log(`Namespace creator: ${GREEN}${creator}${RESET}`);
  console.log(`Is private: ${GREEN}${isPrivate}${RESET}\n`);
  const createdAtDate = new Date(Number(createdAt) * 1000);
  console.log(
    `Created at: ${GREEN}${createdAt}${RESET} [${createdAtDate.toLocaleString()}]\n`
  );

  // Validate that registerName can be used (public namespace after exclusivity period)
  if (isPrivate) {
    throw new Error(
      `Cannot use registerName for private namespace "${namespace}". Use registerNameWithAuthorization instead.`,
    );
  }

  const EXCLUSIVITY_PERIOD = 30n * 24n * 60n * 60n; // 30 days in seconds
  const exclusivityEnd = createdAt + EXCLUSIVITY_PERIOD;
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

  if (currentTimestamp <= exclusivityEnd) {
    const exclusivityEndDate = new Date(Number(exclusivityEnd) * 1000);
    throw new Error(
      `Cannot use registerName during exclusivity period. Exclusivity period ends at ${exclusivityEndDate.toLocaleString()}. Use registerNameWithAuthorization instead.`,
    );
  }

  // Check if address already has a name
  const getName = xns.getFunction("getName(address)");
  const existingName = await getName(signer.address);
  if (existingName !== "") {
    throw new Error(
      `Address ${signer.address} already has a name: ${existingName}`,
    );
  }

  // Check if name is already registered
  const getAddress = xns.getFunction("getAddress(string,string)");
  const existingOwner = await getAddress(label, namespace);
  if (existingOwner !== hre.ethers.ZeroAddress) {
    throw new Error(
      `Name "${label}.${namespace}" is already registered to ${existingOwner}`,
    );
  }

  // Check signer balance
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log(
    `Account balance: ${GREEN}${formatEther(balance)} ETH${RESET}\n`,
  );

  if (balance < pricePerName) {
    throw new Error(
      `Insufficient balance. Need ${formatEther(pricePerName)} ETH, but have ${formatEther(balance)} ETH`,
    );
  }

  // Register name (bare names use namespace "x")
  const fullName = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;
  console.log(`Registering name: ${GREEN}${fullName}${RESET}`);
  console.log(`Sending ${GREEN}${formatEther(pricePerName)} ETH${RESET}...\n`);

  const registerTx = await xns.connect(signer).registerName(label, namespace, {
    value: pricePerName,
  });

  console.log(
    `Transaction hash: ${GREEN}${registerTx.hash}${RESET}\n`,
  );

  console.log("Waiting for confirmation...\n");
  const receipt = await registerTx.wait();

  // Verify registration
  const nameOwner = await getAddress(label, namespace);
  const registeredName = await getName(signer.address);

  console.log(`\n${GREEN}✓ Registration successful!${RESET}\n`);
  console.log(`Name: ${GREEN}${fullName}${RESET}`);
  console.log(`Owner: ${GREEN}${nameOwner}${RESET}`);
  console.log(`Registered name for ${signer.address}: ${GREEN}${registeredName}${RESET}\n`);

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

