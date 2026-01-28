/**
 * Deploy XNS Contract and Register Namespace Tiers
 *
 * DEPLOYMENT COMMAND (using Sepolia as an example):
 * `npx hardhat run scripts/deploy/deployXNS.ts --network sepolia`
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

import hre, { HardhatRuntimeEnvironment } from "hardhat";

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// XNS contract owner address
// Set to null to use the deployer address as the owner
const xnsOwnerAddress: string | null = null;
// Example: const xnsOwnerAddress: string | null = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78"; // use this address as the owner
// Example: const xnsOwnerAddress: string | null = null; // use deployer address as the owner

// Namespace tiers: price (in ETH) -> namespace
const NAMESPACE_TIERS: { priceETH: string; namespace: string }[] = [
  // { priceETH: "0.001", namespace: "xns" },
  // { priceETH: "0.002", namespace: "gm" },
  // { priceETH: "0.003", namespace: "long" },
  // { priceETH: "0.004", namespace: "wtf" },
  // { priceETH: "0.005", namespace: "yolo" },
  // { priceETH: "0.006", namespace: "bro" },
  // { priceETH: "0.007", namespace: "chad" },
  // { priceETH: "0.008", namespace: "og" },
  // { priceETH: "0.009", namespace: "hodl" },
  // { priceETH: "0.01", namespace: "maxi" },
  // { priceETH: "0.015", namespace: "bull" },
  // { priceETH: "0.025", namespace: "pump" },
  // { priceETH: "0.030", namespace: "100x" },
  // { priceETH: "0.035", namespace: "xyz" },
  // { priceETH: "0.040", namespace: "ape" },
  // { priceETH: "0.045", namespace: "moon" },
  // { priceETH: "0.050", namespace: "com" },
  // { priceETH: "0.055", namespace: "io" },
  // { priceETH: "0.888", namespace: "888" }
];

export default async function main(hre: HardhatRuntimeEnvironment) {
  console.log("Starting deployment of XNS...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(deployer.address),
    ),
    "ETH\n",
  );

  // Get owner address from user input or use deployer address
  const ownerAddress = xnsOwnerAddress || deployer.address;

  // Validate owner address if provided
  if (xnsOwnerAddress && !hre.ethers.isAddress(xnsOwnerAddress)) {
    throw new Error(
      `Invalid xnsOwnerAddress: ${xnsOwnerAddress}. Please provide a valid Ethereum address.`,
    );
  }

  console.log(
    `XNS contract owner will be: ${GREEN}${ownerAddress}${RESET}${
      xnsOwnerAddress ? " (from user input)" : " (deployer address)"
    }\n`,
  );

  // Deploy XNS
  const XNS = await hre.ethers.getContractFactory("XNS");
  const xns = await XNS.deploy(ownerAddress);
  await xns.waitForDeployment();

  const contractAddress = await xns.getAddress();
  console.log("XNS deployed to: " + `${GREEN}${contractAddress}${RESET}\n`);

  // Register namespace tiers
  console.log(`Registering ${NAMESPACE_TIERS.length} namespace tiers...\n`);

  for (let i = 0; i < NAMESPACE_TIERS.length; i++) {
    const tier = NAMESPACE_TIERS[i];
    const priceWei = hre.ethers.parseEther(tier.priceETH);

    try {
      console.log(
        `[${i + 1}/${NAMESPACE_TIERS.length}] Registering namespace "${tier.namespace}" at ${tier.priceETH} ETH...`,
      );

      // Use registerPublicNamespaceFor for free onboarding registration (deployer is the owner during deployment)
      // This registers the namespace with deployer as the creator at no cost during the onboarding period
      const tx = await xns.connect(deployer).registerPublicNamespaceFor(
        deployer.address,
        tier.namespace,
        priceWei,
        {
          value: 0,
        },
      );
      await tx.wait();

      console.log(
        `  ${GREEN}✓${RESET} Successfully registered "${tier.namespace}"\n`,
      );
    } catch (error: Error) {
      console.error(
        `  ${YELLOW}✗${RESET} Failed to register "${tier.namespace}": ${error.message}\n`,
      );
      // Continue with next tier instead of failing completely
    }
  }

  console.log(
    "Waiting 30 seconds before beginning the contract verification to allow the block explorer to index the contract...\n",
  );
  await delay(30000); // Wait for 30 seconds before verifying the contract

  // Verify the contract
  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: [ownerAddress],
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

