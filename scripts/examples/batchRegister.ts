/**
 * Script to batch register multiple names with authorization on XNS
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/batchRegister.ts --network <network_name>`
 *
 * EXAMPLE:
 * To batch register names on Sepolia:
 * `npx hardhat run scripts/examples/batchRegister.ts --network sepolia`
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

// Namespace (all registrations must be in the same namespace)
const namespace = "xns";

// Array of labels to register
const labels = ["batch1", "batch2", "batch3"];

// Sponsor index (who pays for all registrations)
const sponsorIndex = 0;

// Starting recipient index (recipients will be signers starting from this index)
// For example, if sponsorIndex=0 and recipientStartIndex=1, then:
// - Recipient 1: signer[1] gets labels[0]
// - Recipient 2: signer[2] gets labels[1]
// - Recipient 3: signer[3] gets labels[2]
const recipientStartIndex = 1;

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
  const sponsor = signers[sponsorIndex];

  // Verify we have enough signers for recipients
  if (recipientStartIndex + labels.length > signers.length) {
    throw new Error(
      `Not enough signers. Need ${recipientStartIndex + labels.length} signers, but only have ${signers.length}`,
    );
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Sponsor (pays fees): ${GREEN}${sponsor.address}${RESET}`);
  console.log(`Number of registrations: ${GREEN}${labels.length}${RESET}\n`);

  // Get namespace info to determine price
  console.log(`Fetching namespace info for "${namespace}"...\n`);
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfo(namespace);

  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Type: ${GREEN}${isPrivate ? "private" : "public"}${RESET}`);
  console.log(`Price per name: ${GREEN}${formatEther(pricePerName)} ETH${RESET}`);
  console.log(`Namespace creator: ${GREEN}${creator}${RESET}\n`);

  // Prepare registrations
  const registerNameAuths = [];
  const signatures = [];
  const recipients = [];

  console.log(`Preparing ${labels.length} registrations...\n`);

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const recipientIndex = recipientStartIndex + i;
    const recipient = signers[recipientIndex] as unknown as SignerWithAddress;
    recipients.push(recipient);

    // Check if recipient already has a name
    const getName = xns.getFunction("getName(address)");
    const existingName = await getName(recipient.address);
    if (existingName !== "") {
      console.log(
        `${YELLOW}⚠${RESET} Skipping "${label}" - recipient ${recipient.address} already has name: ${existingName}`,
      );
      continue;
    }

    // Check if name is already registered
    const getAddress = xns.getFunction("getAddress(string,string)");
    const existingOwner = await getAddress(label, namespace);
    if (existingOwner !== hre.ethers.ZeroAddress) {
      console.log(
        `${YELLOW}⚠${RESET} Skipping "${label}" - already registered to ${existingOwner}`,
      );
      continue;
    }

    console.log(`[${i + 1}/${labels.length}] Preparing "${label}" for ${recipient.address}...`);

    // Recipient signs the EIP-712 message
    const signature = await signRegisterNameAuth(
      xns,
      recipient,
      recipient.address,
      label,
      namespace
    );

    registerNameAuths.push({
      recipient: recipient.address,
      label: label,
      namespace: namespace,
    });
    signatures.push(signature);
  }

  if (registerNameAuths.length === 0) {
    throw new Error("No valid registrations to process (all skipped)");
  }

  console.log(`\n${GREEN}✓${RESET} Prepared ${registerNameAuths.length} valid registrations\n`);

  // Calculate total payment needed
  const totalPayment = pricePerName * BigInt(registerNameAuths.length);

  // Check sponsor balance
  const balance = await hre.ethers.provider.getBalance(sponsor.address);
  console.log(
    `Sponsor balance: ${GREEN}${formatEther(balance)} ETH${RESET}`,
  );
  console.log(
    `Total payment required: ${GREEN}${formatEther(totalPayment)} ETH${RESET}\n`,
  );

  if (balance < totalPayment) {
    throw new Error(
      `Insufficient balance. Need ${formatEther(totalPayment)} ETH, but have ${formatEther(balance)} ETH`,
    );
  }

  // Batch register names
  console.log(`Batch registering ${registerNameAuths.length} names...\n`);

  const batchTx = await xns.connect(sponsor).batchRegisterNameWithAuthorization(
    registerNameAuths,
    signatures,
    { value: totalPayment }
  );

  console.log(
    `Transaction hash: ${GREEN}${batchTx.hash}${RESET}\n`,
  );

  console.log("Waiting for confirmation...\n");
  const receipt = await batchTx.wait();

  // Get return value (number of successful registrations)
  // Note: This requires checking the transaction receipt or events
  // For simplicity, we'll verify registrations individually
  const getAddress = xns.getFunction("getAddress(string,string)");
  const getName = xns.getFunction("getName(address)");

  console.log(`\n${GREEN}✓ Batch registration completed!${RESET}\n`);

  let successCount = 0;
  for (let i = 0; i < registerNameAuths.length; i++) {
    const auth = registerNameAuths[i];
    const nameOwner = await getAddress(auth.label, auth.namespace);
    if (nameOwner === auth.recipient) {
      successCount++;
      const fullName = namespace.toLowerCase() === "x" ? auth.label : `${auth.label}.${auth.namespace}`;
      console.log(
        `  ${GREEN}✓${RESET} ${fullName} → ${auth.recipient}`,
      );
    }
  }

  console.log(`\nSuccessfully registered: ${GREEN}${successCount}${RESET} name(s)\n`);

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

