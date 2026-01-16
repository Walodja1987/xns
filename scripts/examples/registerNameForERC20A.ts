/**
 * Script to deploy a MockERC20A contract and register an XNS name via constructor
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/registerNameForERC20A.ts --network <network_name>`
 *
 * EXAMPLE:
 * To deploy and register on Sepolia:
 * `npx hardhat run scripts/examples/registerNameForERC20A.ts --network sepolia`
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

// Token name (e.g., "My Token", "Example Token")
const tokenName = "My Token A";

// Token symbol (e.g., "MTK", "EXT")
const tokenSymbol = "MTKA";

// Initial token supply
const initialSupply = parseEther("1000000"); // 1,000,000 tokens

// Label to register (e.g., "mytoken", "example")
const label = "mytoken-a";

// Namespace (e.g., "xns", "x" for bare names, "001", etc.)
const namespace = "xns";

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

  // Get signer
  const signers = await hre.ethers.getSigners();
  const signer = signers[signerIndex];

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Deploying with account: ${GREEN}${signer.address}${RESET}\n`);

  // Check signer balance
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log(
    `Account balance: ${GREEN}${formatEther(balance)} ETH${RESET}\n`,
  );

  // Get namespace info to determine price
  const xns = await hre.ethers.getContractAt("XNS", contractAddress);
  console.log(`Fetching namespace info for "${namespace}"...\n`);
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  const [pricePerName, creator, createdAt] = await getNamespaceInfo(namespace);

  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Price per name: ${GREEN}${formatEther(pricePerName)} ETH${RESET}`);
  console.log(`Namespace creator: ${GREEN}${creator}${RESET}\n`);

  // Check if name is already registered
  const getAddress = xns.getFunction("getAddress(string,string)");
  const existingOwner = await getAddress(label, namespace);
  if (existingOwner !== hre.ethers.ZeroAddress) {
    throw new Error(
      `Name "${label}.${namespace}" is already registered to ${existingOwner}`,
    );
  }

  if (balance < pricePerName) {
    throw new Error(
      `Insufficient balance. Need at least ${formatEther(pricePerName)} ETH for registration, but have ${formatEther(balance)} ETH`,
    );
  }

  // Deploy MockERC20A contract with name registration in constructor
  console.log(`Deploying MockERC20A contract with name registration...`);
  console.log(`  Token name: ${GREEN}${tokenName}${RESET}`);
  console.log(`  Token symbol: ${GREEN}${tokenSymbol}${RESET}`);
  console.log(`  Initial supply: ${GREEN}${formatEther(initialSupply)} ${tokenSymbol}${RESET}`);
  
  const fullName = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;
  console.log(`  XNS name to register: ${GREEN}${fullName}${RESET}`);
  console.log(`  Sending ${GREEN}${formatEther(pricePerName)} ETH${RESET}...\n`);

  const MockERC20A = await hre.ethers.getContractFactory("MockERC20A");
  const erc20 = await MockERC20A.deploy(
    tokenName,
    tokenSymbol,
    contractAddress, // XNS contract address
    initialSupply,
    label,
    namespace,
    { value: pricePerName }
  );
  await erc20.waitForDeployment();

  const erc20Address = await erc20.getAddress();
  console.log(`\n${GREEN}✓${RESET} MockERC20A deployed to: ${GREEN}${erc20Address}${RESET}`);

  // Verify registration
  const nameOwner = await getAddress(label, namespace);
  const getName = xns.getFunction("getName(address)");
  const registeredName = await getName(erc20Address);

  console.log(`\n${GREEN}✓ Name registration successful!${RESET}\n`);
  console.log(`Contract address: ${GREEN}${erc20Address}${RESET}`);
  console.log(`XNS name: ${GREEN}${fullName}${RESET}`);
  console.log(`Name owner: ${GREEN}${nameOwner}${RESET}`);
  console.log(`Registered name for contract: ${GREEN}${registeredName}${RESET}\n`);

  // Check balances after
  const balanceAfter = await hre.ethers.provider.getBalance(signer.address);
  const contractBalance = await hre.ethers.provider.getBalance(erc20Address);
  
  console.log(`Account balance after: ${GREEN}${formatEther(balanceAfter)} ETH${RESET}`);
  console.log(`Contract balance: ${GREEN}${formatEther(contractBalance)} ETH${RESET} (refunded excess if any)\n`);

  // Display token info
  const tokenBalance = await erc20.balanceOf(signer.address);
  console.log(`Token balance: ${GREEN}${formatEther(tokenBalance)} ${tokenSymbol}${RESET}\n`);
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

