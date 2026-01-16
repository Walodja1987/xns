/**
 * Script to deploy three MockERC20C contracts (EIP-1271) and batch register XNS names for them
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/batchRegisterNameWithAuthorization.ts --network <network_name>`
 *
 * EXAMPLE:
 * To deploy contracts and batch register names on Sepolia:
 * `npx hardhat run scripts/examples/batchRegisterNameWithAuthorization.ts --network sepolia`
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

// Namespace (all registrations must be in the same namespace)
const namespace = "xns";

// Array of labels to register (one for each contract)
const labels = ["batch1", "batch2", "batch3"];

// Array of token names (one for each contract)
const tokenNames = ["Batch Token 1", "Batch Token 2", "Batch Token 3"];

// Array of token symbols (one for each contract)
const tokenSymbols = ["BTK1", "BTK2", "BTK3"];

// Initial token supply for each contract
const initialSupply = parseEther("1000000"); // 1,000,000 tokens

// Sponsor index (who pays for all registrations)
const sponsorIndex = 0;

// Starting owner index (owners will be signers starting from this index)
// Each contract owner signs the authorization for their contract
// For example, if sponsorIndex=0 and ownerStartIndex=1, then:
// - Contract 1: owner signer[1], gets labels[0]
// - Contract 2: owner signer[2], gets labels[1]
// - Contract 3: owner signer[3], gets labels[2]
const ownerStartIndex = 1;

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

  // Verify we have enough signers for owners
  if (ownerStartIndex + labels.length > signers.length) {
    throw new Error(
      `Not enough signers. Need ${ownerStartIndex + labels.length} signers, but only have ${signers.length}`,
    );
  }

  // Verify arrays match
  if (labels.length !== tokenNames.length || labels.length !== tokenSymbols.length) {
    throw new Error("labels, tokenNames, and tokenSymbols arrays must have the same length");
  }

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Sponsor (pays fees): ${GREEN}${sponsor.address}${RESET}`);
  console.log(`Number of contracts to deploy: ${GREEN}${labels.length}${RESET}\n`);

  // Get namespace info to determine price
  console.log(`Fetching namespace info for "${namespace}"...\n`);
  const getNamespaceInfo = xns.getFunction("getNamespaceInfo(string)");
  const [pricePerName, creator, createdAt, isPrivate] = await getNamespaceInfo(namespace);

  console.log(`Namespace: ${GREEN}${namespace}${RESET}`);
  console.log(`Type: ${GREEN}${isPrivate ? "private" : "public"}${RESET}`);
  console.log(`Price per name: ${GREEN}${formatEther(pricePerName)} ETH${RESET}`);
  console.log(`Namespace creator: ${GREEN}${creator}${RESET}\n`);

  // Deploy MockERC20C contracts
  console.log(`Deploying ${labels.length} MockERC20C contracts (EIP-1271)...\n`);
  const MockERC20C = await hre.ethers.getContractFactory("MockERC20C");
  const contracts = [];

  for (let i = 0; i < labels.length; i++) {
    const ownerIndex = ownerStartIndex + i;
    const owner = signers[ownerIndex];
    
    console.log(`[${i + 1}/${labels.length}] Deploying contract for "${labels[i]}"...`);
    console.log(`  Token name: ${GREEN}${tokenNames[i]}${RESET}`);
    console.log(`  Token symbol: ${GREEN}${tokenSymbols[i]}${RESET}`);
    console.log(`  Contract owner: ${GREEN}${owner.address}${RESET}`);

    const erc20 = await MockERC20C.deploy(
      tokenNames[i],
      tokenSymbols[i],
      owner.address,
      initialSupply
    );
    await erc20.waitForDeployment();
    const erc20Address = await erc20.getAddress();
    
    console.log(`  ${GREEN}✓${RESET} Deployed to: ${GREEN}${erc20Address}${RESET}\n`);
    contracts.push({ erc20, erc20Address, owner, label: labels[i] });
  }

  // Prepare registrations
  const registerNameAuths = [];
  const signatures = [];

  console.log(`Preparing ${labels.length} registrations...\n`);

  for (let i = 0; i < contracts.length; i++) {
    const { erc20Address, owner, label } = contracts[i];
    const ownerAsSigner = owner as unknown as SignerWithAddress;

    // Check if contract address already has a name
    const getName = xns.getFunction("getName(address)");
    const existingName = await getName(erc20Address);
    if (existingName !== "") {
      console.log(
        `${YELLOW}⚠${RESET} Skipping "${label}" - contract ${erc20Address} already has name: ${existingName}`,
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

    console.log(`[${i + 1}/${contracts.length}] Preparing "${label}" for ${erc20Address}...`);
    console.log(`  Contract owner: ${GREEN}${owner.address}${RESET}`);

    // Contract owner signs the EIP-712 message to authorize the registration
    const signature = await signRegisterNameAuth(
      xns,
      ownerAsSigner,
      erc20Address, // Contract receives the name
      label,
      namespace
    );

    registerNameAuths.push({
      recipient: erc20Address,
      label: label,
      namespace: namespace,
    });
    signatures.push(signature);
    
    console.log(`  ${GREEN}✓${RESET} Authorization signature obtained\n`);
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
    const registeredName = await getName(auth.recipient);
    if (nameOwner === auth.recipient) {
      successCount++;
      const fullName = namespace.toLowerCase() === "x" ? auth.label : `${auth.label}.${auth.namespace}`;
      console.log(
        `  ${GREEN}✓${RESET} ${fullName} → ${auth.recipient}`,
      );
      console.log(
        `     Registered name for contract: ${GREEN}${registeredName}${RESET}`,
      );
    }
  }

  console.log(`\nSuccessfully registered: ${GREEN}${successCount}${RESET} name(s)\n`);

  // Display contract info
  console.log(`Contract deployment summary:\n`);
  for (let i = 0; i < contracts.length; i++) {
    const { erc20Address, label, owner } = contracts[i];
    const registeredName = await getName(erc20Address);
    const fullName = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;
    console.log(`  [${i + 1}] ${GREEN}${tokenSymbols[i]}${RESET}`);
    console.log(`      Contract: ${GREEN}${erc20Address}${RESET}`);
    console.log(`      Owner: ${GREEN}${owner.address}${RESET}`);
    console.log(`      XNS name: ${GREEN}${registeredName || "(not registered)"}${RESET}`);
    console.log(`      Full name: ${GREEN}${fullName}${RESET}\n`);
  }

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

