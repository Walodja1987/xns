/**
 * Deploy WalletChanXNSAdapter
 *
 * The constructor calls `registerName` on XNS as `walletchanadapter.xns` and must receive **exactly**
 * `getNamespacePrice("xns")` at deploy time (see contract NatSpec).
 *
 * DEPLOYMENT COMMAND (Sepolia example):
 * `npx hardhat run scripts/deploy/deployWalletChanXNSAdapter.ts --network sepolia`
 *
 * REQUIRED SETUP:
 * Same as `deployXNS.ts` — `PRIVATE_KEY`, `ETHERSCAN_API_KEY`, and the RPC var for your network
 * (e.g. `ETH_SEPOLIA_TESTNET_URL`). See `hardhat.config.ts`.
 *
 * XNS address: read from `constants/addresses.ts` using the Hardhat network name (`sepolia`, `ethMain`, …).
 * Add a key there before deploying on a new network.
 */

import hre, { HardhatRuntimeEnvironment } from "hardhat";
import { XNS_ADDRESS } from "../../constants/addresses";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveXnsAddress(): string {
  const name = hre.network.name;
  const raw = XNS_ADDRESS[name];
  if (!raw) {
    throw new Error(
      `No XNS address for network "${name}" in constants/addresses.ts. Add an entry keyed by that network name.`,
    );
  }
  if (!hre.ethers.isAddress(raw)) {
    throw new Error(`Invalid XNS address in constants/addresses.ts for "${name}": ${raw}`);
  }
  return hre.ethers.getAddress(raw);
}

export default async function main(hre: HardhatRuntimeEnvironment) {
  console.log("Deploying WalletChanXNSAdapter...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH\n",
  );

  const xnsAddress = resolveXnsAddress();
  console.log(`${GREEN}XNS registry:${RESET} ${xnsAddress}\n`);

  const xns = await hre.ethers.getContractAt("XNS", xnsAddress);
  const priceWei = await xns.getNamespacePrice("xns");
  console.log(
    `Exact ETH required for walletchanadapter.xns (constructor): ${GREEN}${hre.ethers.formatEther(priceWei)}${RESET} ETH\n`,
  );

  const Factory = await hre.ethers.getContractFactory("WalletChanXNSAdapter");
  const adapter = await Factory.deploy(xnsAddress, { value: priceWei });
  await adapter.waitForDeployment();

  const adapterAddress = await adapter.getAddress();
  console.log("WalletChanXNSAdapter deployed to:", `${GREEN}${adapterAddress}${RESET}\n`);

  console.log(
    "Waiting 30 seconds before contract verification so the explorer can index the deployment...\n",
  );
  await delay(30000);

  await hre.run("verify:verify", {
    address: adapterAddress,
    constructorArguments: [xnsAddress],
  });

  console.log("\nDeployment and verification completed successfully!");
}

main(hre)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
