/**
 * Script to deploy a MockERC20C contract (EIP-1271)
 * Useful for testing signature validation via Etherscan
 *
 * USAGE:
 * Run the script with:
 * `npx hardhat run scripts/examples/deployMockERC20C.ts --network <network_name>`
 *
 * EXAMPLE:
 * To deploy on Sepolia:
 * `npx hardhat run scripts/examples/deployMockERC20C.ts --network sepolia`
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

// Colour codes for terminal prints
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

/*//////////////////////////////////////////////////////////////
                            USER INPUTS
//////////////////////////////////////////////////////////////*/

// Token name (e.g., "My Token", "Example Token")
const tokenName = "Test Token C";

// Token symbol (e.g., "MTK", "EXT")
const tokenSymbol = "TTKC";

// Initial token supply
const initialSupply = parseEther("1000000"); // 1,000,000 tokens

// Owner index (the address that will control this contract - will sign EIP-712 messages)
// This owner's signature will be validated by the contract's EIP-1271 isValidSignature function
const ownerIndex = 0; // Index of signer from mnemonic

// Deployer index (who pays for deployment - can be different from owner)
const deployerIndex = 0; // Index of signer from mnemonic

async function main() {
  const networkName = hre.network.name;

  // Get signers
  const signers = await hre.ethers.getSigners();
  const deployer = signers[deployerIndex];
  const owner = signers[ownerIndex];

  console.log(`\nNetwork: ${GREEN}${networkName}${RESET}`);
  console.log(`Deploying with account: ${GREEN}${deployer.address}${RESET}`);
  console.log(`Contract owner: ${GREEN}${owner.address}${RESET}\n`);

  // Check deployer balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(
    `Deployer balance: ${GREEN}${formatEther(balance)} ETH${RESET}\n`,
  );

  // Deploy MockERC20C contract (EIP-1271)
  console.log(`Deploying MockERC20C contract (EIP-1271)...`);
  console.log(`  Token name: ${GREEN}${tokenName}${RESET}`);
  console.log(`  Token symbol: ${GREEN}${tokenSymbol}${RESET}`);
  console.log(`  Initial supply: ${GREEN}${formatEther(initialSupply)} ${tokenSymbol}${RESET}`);
  console.log(`  Contract owner: ${GREEN}${owner.address}${RESET}\n`);

  const MockERC20C = await hre.ethers.getContractFactory("MockERC20C");
  const erc20 = await MockERC20C.connect(deployer).deploy(
    tokenName,
    tokenSymbol,
    owner.address, // Contract owner
    initialSupply
  );
  await erc20.waitForDeployment();

  const erc20Address = await erc20.getAddress();
  
  console.log(`\n${GREEN}✓${RESET} MockERC20C deployed successfully!\n`);

  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}              DEPLOYMENT INFORMATION${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

  console.log(`Contract address: ${GREEN}${erc20Address}${RESET}`);
  console.log(`Token name: ${GREEN}${tokenName}${RESET}`);
  console.log(`Token symbol: ${GREEN}${tokenSymbol}${RESET}`);
  console.log(`Contract owner: ${GREEN}${owner.address}${RESET}`);
  console.log(`Initial supply: ${GREEN}${formatEther(initialSupply)} ${tokenSymbol}${RESET}\n`);

  // Verify owner can sign for this contract
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}              NEXT STEPS FOR TESTING${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

  console.log(`To test EIP-1271 signature validation:\n`);
  console.log(`1. Run ${GREEN}generateSignature.ts${RESET} with:`);
  console.log(`   - recipient: ${GREEN}${erc20Address}${RESET}`);
  console.log(`   - signerIndex: ${GREEN}${ownerIndex}${RESET} (must match contract owner)\n`);
  console.log(`2. Use the generated signature with XNS contract on Etherscan\n`);
  console.log(`3. Test isValidSignature on the contract:`);
  console.log(`   - Go to: ${GREEN}https://etherscan.io/address/${erc20Address}#readContract${RESET}`);
  console.log(`   - (Replace etherscan.io with the appropriate explorer for your network)\n`);
  console.log(`4. Call ${GREEN}registerNameWithAuthorization${RESET} on XNS with:`);
  console.log(`   - registerNameAuth.recipient: ${GREEN}${erc20Address}${RESET}`);
  console.log(`   - registerNameAuth.label: ${GREEN}(your chosen label)${RESET}`);
  console.log(`   - registerNameAuth.namespace: ${GREEN}(your chosen namespace)${RESET}`);
  console.log(`   - signature: ${GREEN}(from generateSignature.ts)${RESET}\n`);

  // Check token balance
  const tokenBalance = await erc20.balanceOf(owner.address);
  console.log(`Owner token balance: ${GREEN}${formatEther(tokenBalance)} ${tokenSymbol}${RESET}\n`);

  // Output as JSON for programmatic use
  const output = {
    network: networkName,
    contractAddress: erc20Address,
    tokenName: tokenName,
    tokenSymbol: tokenSymbol,
    owner: owner.address,
    deployer: deployer.address,
    initialSupply: initialSupply.toString(),
  };

  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
  console.log(`JSON output (for programmatic use):`);
  console.log(`${GREEN}${JSON.stringify(output, null, 2)}${RESET}\n`);
}

main().catch((error: unknown) => {
  console.error(RED + (error instanceof Error ? error.message : String(error)) + RESET);
  process.exitCode = 1;
});

