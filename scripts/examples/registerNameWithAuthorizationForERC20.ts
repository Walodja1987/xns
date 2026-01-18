/**
 * Script to deploy a MockERC20C contract (EIP-1271) and register an XNS name via sponsorship
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/registerNameWithAuthorizationForERC20.ts --network <network_name>`
 *
 * EXAMPLE:
 * To deploy and register on Sepolia:
 * `npx hardhat run scripts/examples/registerNameWithAuthorizationForERC20.ts --network sepolia`
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
import { XNS } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { XNS_ADDRESS } from "../../constants/addresses";
import { signRegisterNameAuth } from "../utils/signRegisterNameAuth";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Token name (e.g., "My Token", "Example Token")
const tokenName = "My Token C";

// Token symbol (e.g., "MTK", "EXT")
const tokenSymbol = "MTKC";

// Initial token supply
const initialSupply = parseEther("1000000"); // 1,000,000 tokens

// Label to register (e.g., "mytoken", "example")
const label = "mytoken-c";

// Namespace (e.g., "xns", "x" for bare names, "001", etc.)
const namespace = "xns";

// Owner index (the owner of the ERC20 contract - will sign the authorization)
const ownerIndex = 0;

// Sponsor index (who pays for the registration - can be different from owner)
const sponsorIndex = 1;

async function main() {
  const networkName = hre.network.name;

  // Get XNS address for the current network
  const contractAddress = XNS_ADDRESS[networkName];
  if (!contractAddress) {
    throw new Error(
      `XNS contract address not set for network: ${networkName}. Please add address to constants/addresses.ts`,
    );
  }

  // Get signers
  const signers = await hre.ethers.getSigners();
  const owner = signers[ownerIndex];
  const sponsor = signers[sponsorIndex];

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Contract owner: ${GREEN}${owner.address}${RESET}`);
  console.log(`Sponsor (pays fees): ${GREEN}${sponsor.address}${RESET}\n`);

  // Check sponsor balance
  const sponsorBalance = await hre.ethers.provider.getBalance(sponsor.address);
  console.log(
    `Sponsor balance: ${GREEN}${formatEther(sponsorBalance)} ETH${RESET}\n`,
  );

  // Get namespace info to determine price
  const xns = await hre.ethers.getContractAt("XNS", contractAddress) as unknown as XNS;
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

  if (sponsorBalance < pricePerName) {
    throw new Error(
      `Insufficient sponsor balance. Need at least ${formatEther(pricePerName)} ETH, but have ${formatEther(sponsorBalance)} ETH`,
    );
  }

  // Deploy MockERC20C contract (EIP-1271)
  console.log(`Deploying MockERC20C contract (EIP-1271)...`);
  console.log(`  Token name: ${GREEN}${tokenName}${RESET}`);
  console.log(`  Token symbol: ${GREEN}${tokenSymbol}${RESET}`);
  console.log(`  Initial supply: ${GREEN}${formatEther(initialSupply)} ${tokenSymbol}${RESET}`);
  console.log(`  Contract owner: ${GREEN}${owner.address}${RESET}\n`);

  const MockERC20C = await hre.ethers.getContractFactory("MockERC20C");
  const erc20 = await MockERC20C.deploy(
    tokenName,
    tokenSymbol,
    owner.address, // Contract owner
    initialSupply
  );
  await erc20.waitForDeployment();

  const erc20Address = await erc20.getAddress();
  console.log(`\n${GREEN}✓${RESET} MockERC20C deployed to: ${GREEN}${erc20Address}${RESET}\n`);

  // Check if contract address already has a name
  const getName = xns.getFunction("getName(address)");
  const existingName = await getName(erc20Address);
  if (existingName !== "") {
    console.log(
      `${YELLOW}⚠${RESET} Contract ${erc20Address} already has a name: ${existingName}`,
    );
    console.log(`Skipping registration.\n`);
    return;
  }

  // Owner signs the EIP-712 message to authorize the registration
  console.log(`Contract owner signing authorization message...\n`);
  const ownerAsSigner = owner as unknown as SignerWithAddress;
  const signature = await signRegisterNameAuth(
    xns,
    ownerAsSigner,
    erc20Address, // Contract receives the name
    label,
    namespace
  );
  console.log(`${GREEN}✓${RESET} Authorization signature obtained\n`);

  // Prepare RegisterNameAuth struct
  const registerNameAuth = {
    recipient: erc20Address,
    label: label,
    namespace: namespace,
  };

  // Sponsor registers the name for the contract
  const fullName = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;
  console.log(`Sponsor registering XNS name for contract: ${GREEN}${fullName}${RESET}`);
  console.log(`Contract recipient: ${GREEN}${erc20Address}${RESET}`);
  console.log(`Sponsor: ${GREEN}${sponsor.address}${RESET}`);
  console.log(`Sending ${GREEN}${formatEther(pricePerName)} ETH${RESET}...\n`);

  const registerTx = await xns.connect(sponsor).registerNameWithAuthorization(
    registerNameAuth,
    signature,
    { value: pricePerName }
  );

  console.log(
    `Transaction hash: ${GREEN}${registerTx.hash}${RESET}\n`,
  );

  console.log("Waiting for confirmation...\n");
  const receipt = await registerTx.wait();

  // Verify registration
  const nameOwner = await getAddress(label, namespace);
  const registeredName = await getName(erc20Address);

  console.log(`\n${GREEN}✓ Registration successful!${RESET}\n`);
  console.log(`Contract address: ${GREEN}${erc20Address}${RESET}`);
  console.log(`XNS name: ${GREEN}${fullName}${RESET}`);
  console.log(`Name owner: ${GREEN}${nameOwner}${RESET}`);
  console.log(`Registered name for contract: ${GREEN}${registeredName}${RESET}\n`);

  // Check balances after
  const sponsorBalanceAfter = await hre.ethers.provider.getBalance(sponsor.address);
  const contractBalance = await hre.ethers.provider.getBalance(erc20Address);
  
  console.log(`Sponsor balance after: ${GREEN}${formatEther(sponsorBalanceAfter)} ETH${RESET}`);
  console.log(`Contract balance: ${GREEN}${formatEther(contractBalance)} ETH${RESET} (should be 0 - no refunds to contract)\n`);

  // Display token info
  const tokenBalance = await erc20.balanceOf(owner.address);
  console.log(`Owner token balance: ${GREEN}${formatEther(tokenBalance)} ${tokenSymbol}${RESET}\n`);
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

