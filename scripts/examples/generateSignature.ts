/**
 * Script to generate an EIP-712 signature for RegisterNameAuth
 * Useful for signing off-chain and executing via Etherscan or other tools
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/generateSignature.ts --network <network_name>`
 *
 * EXAMPLE:
 * To generate a signature on Sepolia:
 * `npx hardhat run scripts/examples/generateSignature.ts --network sepolia`
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
import { XNS } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { XNS_ADDRESS } from "../../constants/addresses";
import { signRegisterNameAuth } from "../utils/signRegisterNameAuth";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Label to register (e.g., "alice", "bob", "vitalik")
const label = "example-user";

// Namespace (e.g., "xns", "x" for bare names, "001", etc.)
const namespace = "xns";

// Signer index (the signer that will authorize the registration)
// This signer must match the recipient for EOA, or be the owner for EIP-1271 contracts
const signerIndex = 0;

// Recipient address (who will receive the name)
// For EOA: use the signer's address
// For EIP-1271 contract: use the contract address (contract owner must sign)
// You can also specify a custom address directly as a string: "0x..."
const recipientAddress: string | null = "0xBAD3814f24c1064d41278aE2eCC03A16bBCE6693"; // null = use signer's address

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
  const signer = signers[signerIndex] as unknown as SignerWithAddress;

  // Determine recipient address
  const recipient = recipientAddress || signer.address;

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`XNS contract: ${GREEN}${contractAddress}${RESET}`);
  console.log(`Signer: ${GREEN}${signer.address}${RESET}`);
  console.log(`Recipient: ${GREEN}${recipient}${RESET}`);
  console.log(`Label: ${GREEN}${label}${RESET}`);
  console.log(`Namespace: ${GREEN}${namespace}${RESET}\n`);

  // Generate signature
  console.log(`Generating EIP-712 signature...\n`);
  const signature = await signRegisterNameAuth(
    xns,
    signer,
    recipient,
    label,
    namespace
  );

  const fullName = namespace.toLowerCase() === "x" ? label : `${label}.${namespace}`;

  console.log(`${GREEN}✓ Signature generated!${RESET}\n`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}              SIGNATURE INFORMATION${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

  console.log(`Signature (hex):`);
  console.log(`${GREEN}${signature}${RESET}\n`);

  console.log(`RegisterNameAuth struct values:`);
  console.log(`  recipient: ${GREEN}${recipient}${RESET}`);
  console.log(`  label: ${GREEN}"${label}"${RESET}`);
  console.log(`  namespace: ${GREEN}"${namespace}"${RESET}\n`);

  console.log(`Full name: ${GREEN}${fullName}${RESET}\n`);

  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}              USAGE WITH ETHERSCAN${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

  console.log(`To execute via Etherscan:\n`);
  console.log(`1. Go to: ${GREEN}https://etherscan.io/address/${contractAddress}#writeContract${RESET}`);
  console.log(`   (Replace etherscan.io with the appropriate explorer for your network)\n`);
  console.log(`2. Connect your wallet (sponsor - the one who pays fees)\n`);
  console.log(`3. Find the ${GREEN}registerNameWithAuthorization${RESET} function\n`);
  console.log(`4. Fill in the parameters:\n`);
  console.log(`   registerNameAuth:`);
  console.log(`     recipient: ${GREEN}${recipient}${RESET}`);
  console.log(`     label: ${GREEN}"${label}"${RESET}`);
  console.log(`     namespace: ${GREEN}"${namespace}"${RESET}`);
  console.log(`   signature: ${GREEN}${signature}${RESET}\n`);
  console.log(`5. Send the transaction with the required ETH value (check namespace price)\n`);

  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

  // Also output as JSON for programmatic use
  const output = {
    network: networkName,
    xnsContract: contractAddress,
    signer: signer.address,
    recipient: recipient,
    registerNameAuth: {
      recipient: recipient,
      label: label,
      namespace: namespace,
    },
    signature: signature,
    fullName: fullName,
  };

  console.log(`JSON output (for programmatic use):`);
  console.log(`${GREEN}${JSON.stringify(output, null, 2)}${RESET}\n`);
}

main().catch((error: unknown) => {
  console.error("\x1b[31m" + (error instanceof Error ? error.message : String(error)) + "\x1b[0m");
  process.exitCode = 1;
});

