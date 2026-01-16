/**
 * Script to register a name with authorization (sponsorship) on XNS
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/registerNameWithAuthorization.ts --network <network_name>`
 *
 * EXAMPLE:
 * To register a name with authorization on Sepolia:
 * `npx hardhat run scripts/examples/registerNameWithAuthorization.ts --network sepolia`
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

// Label to register (e.g., "alice", "bob", "vitalik")
const label = "sponsored-user";

// Namespace (e.g., "xns", "x" for bare names, "001", etc.)
const namespace = "xns";

// Recipient address (who will receive the name - must sign the EIP-712 message)
// For this example, we'll use a signer from the mnemonic, but in practice this could be any address
const recipientIndex = 1; // Index of signer that will receive the name (must sign)

// Sponsor index (who pays for the registration)
const sponsorIndex = 0; // Index of signer that pays for the registration

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
  const xns = await hre.ethers.getContractAt("XNS", contractAddress) as unknown as XNS;

  // Get signers
  const signers = await hre.ethers.getSigners();
  const recipient = signers[recipientIndex] as unknown as SignerWithAddress;
  const sponsor = signers[sponsorIndex];

  if (recipientIndex === sponsorIndex) {
    throw new Error("Recipient and sponsor must be different addresses");
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Recipient (will receive name): ${GREEN}${recipient.address}${RESET}`);
  console.log(`Sponsor (pays fees): ${GREEN}${sponsor.address}${RESET}\n`);

  // Get namespace info to determine price
  console.log(`Fetching namespace info for "${namespace}"...\n`);
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfo(namespace);

  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Type: ${GREEN}${isPrivate ? "private" : "public"}${RESET}`);
  console.log(`Price per name: ${GREEN}${formatEther(pricePerName)} ETH${RESET}`);
  console.log(`Namespace creator: ${GREEN}${creator}${RESET}\n`);

  // Check if recipient already has a name
  const getName = xns.getFunction("getName(address)");
  const existingName = await getName(recipient.address);
  if (existingName !== "") {
    throw new Error(
      `Recipient ${recipient.address} already has a name: ${existingName}`,
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

  // Check sponsor balance
  const balance = await hre.ethers.provider.getBalance(sponsor.address);
  console.log(
    `Sponsor balance: ${GREEN}${formatEther(balance)} ETH${RESET}\n`,
  );

  if (balance < pricePerName) {
    throw new Error(
      `Insufficient balance. Need ${formatEther(pricePerName)} ETH, but have ${formatEther(balance)} ETH`,
    );
  }

  // Recipient signs the EIP-712 message to authorize the registration
  console.log(`Recipient signing authorization message...\n`);
  const signature = await signRegisterNameAuth(xns, recipient, recipient.address, label, namespace);
  console.log(`${GREEN}✓${RESET} Authorization signature obtained\n`);

  // Prepare RegisterNameAuth struct
  const registerNameAuth = {
    recipient: recipient.address,
    label: label,
    namespace: namespace,
  };

  // Register name with authorization
  const fullName = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;
  console.log(`Registering name: ${GREEN}${fullName}${RESET}`);
  console.log(`Recipient: ${GREEN}${recipient.address}${RESET}`);
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
  const registeredName = await getName(recipient.address);

  console.log(`\n${GREEN}✓ Registration successful!${RESET}\n`);
  console.log(`Name: ${GREEN}${fullName}${RESET}`);
  console.log(`Owner: ${GREEN}${nameOwner}${RESET}`);
  console.log(`Registered name for ${recipient.address}: ${GREEN}${registeredName}${RESET}\n`);

  // Check sponsor balance after
  const balanceAfter = await hre.ethers.provider.getBalance(sponsor.address);
  console.log(
    `Sponsor balance after: ${GREEN}${formatEther(balanceAfter)} ETH${RESET}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

