/**
 * Script to claim accumulated fees from XNS and send them to yourself (claimFeesToSelf)
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/claimFeesToSelf.ts --network <network_name>`
 *
 * EXAMPLE:
 * To claim fees on Sepolia:
 * `npx hardhat run scripts/examples/claimFeesToSelf.ts --network sepolia`
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
// This account must have pending fees to claim
// Fees will be sent to this same account (claimFeesToSelf)
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
  console.log(`Claiming fees for: ${GREEN}${signer.address}${RESET}`);
  console.log(`Fees will be sent to: ${GREEN}${signer.address}${RESET} (same address)\n`);

  // Check pending fees
  const getPendingFees = xns.getFunction("getPendingFees(address)");
  const pendingFees = await getPendingFees(signer.address);

  console.log(`Pending fees: ${GREEN}${formatEther(pendingFees)} ETH${RESET}\n`);

  if (pendingFees === 0n) {
    console.log(`${YELLOW}⚠${RESET} No pending fees to claim for ${signer.address}\n`);
    return;
  }

  // Check balance before
  const balanceBefore = await hre.ethers.provider.getBalance(signer.address);
  console.log(
    `Balance before: ${GREEN}${formatEther(balanceBefore)} ETH${RESET}\n`,
  );

  // Claim fees to self
  console.log(`Claiming fees to self...\n`);

  const claimTx = await xns.connect(signer).claimFeesToSelf();

  console.log(
    `Transaction hash: ${GREEN}${claimTx.hash}${RESET}\n`,
  );

  console.log("Waiting for confirmation...\n");
  const receipt = await claimTx.wait();

  // Verify fees were claimed
  const pendingFeesAfter = await getPendingFees(signer.address);
  const balanceAfter = await hre.ethers.provider.getBalance(signer.address);

  console.log(`\n${GREEN}✓ Fees claimed successfully!${RESET}\n`);
  console.log(`Pending fees before: ${GREEN}${formatEther(pendingFees)} ETH${RESET}`);
  console.log(`Pending fees after: ${GREEN}${formatEther(pendingFeesAfter)} ETH${RESET}`);
  console.log(`Balance before: ${GREEN}${formatEther(balanceBefore)} ETH${RESET}`);
  console.log(`Balance after: ${GREEN}${formatEther(balanceAfter)} ETH${RESET}`);
  
  // Calculate fees received (accounting for gas costs)
  const feesReceived = balanceAfter - balanceBefore + receipt!.gasUsed * receipt!.gasPrice;
  console.log(`Fees received: ${GREEN}${formatEther(pendingFees)} ETH${RESET} (amount claimed)`);
  console.log(`Net balance change: ${GREEN}${formatEther(balanceAfter - balanceBefore)} ETH${RESET} (after gas)\n`);
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

