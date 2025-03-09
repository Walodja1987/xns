/**
 * Deploy DETH Contract
 *
 * DEPLOYMENT COMMAND (using Sepolia as an example):
 * `npx hardhat run deploy/deployDETH.ts --network sepolia`
 *
 * REQUIRED SETUP:
 * Before first deployment, set these environment variables using hardhat-vars:
 *
 * 1. Network Independent Setup:
 *    - PRIVATE_KEY:       `npx hardhat vars set PRIVATE_KEY`
 *    - ETHERSCAN_API_KEY: `npx hardhat vars set ETHERSCAN_API_KEY`
 *
 * 2. Network Specific Setup:
 *    - ETH_SEPOLIA_TESTNET_URL: `npx hardhat vars set ETH_SEPOLIA_TESTNET_URL`
 *
 * Note: Variable names must match those in hardhat.config.ts
 */

import { HardhatRuntimeEnvironment } from "hardhat/types";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function main(hre: HardhatRuntimeEnvironment) {
  console.log("Starting deployment of DETH...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy DETH
  const DETH = await hre.ethers.getContractFactory("DETH");
  const deth = await DETH.deploy();
  await deth.waitForDeployment();

  const contractAddress = await deth.getAddress();
  console.log(
    "DETH deployed to: " + `${GREEN}${contractAddress}${RESET}\n`
  );

  console.log(
    "Waiting 30 seconds before beginning the contract verification to allow the block explorer to index the contract...\n"
  );
  await delay(30000); // Wait for 30 seconds before verifying the contract

  // Verify the contract
  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: []
  });

  console.log("\nDeployment and verification completed successfully!");
}

// Execute the deployment
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(hre)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
