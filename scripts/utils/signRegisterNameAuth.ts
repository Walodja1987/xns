/**
 * Utility function to sign RegisterNameAuth for EIP-712
 * Shared between scripts and tests
 */

import { ethers } from "hardhat";
import { XNS } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Signs a RegisterNameAuth struct using EIP-712 for use in registerNameWithAuthorization
 * @param xns The XNS contract instance
 * @param signer The signer that will authorize the registration
 * @param recipient The address that will receive the name (must match signer for EOA, or be the contract for EIP-1271)
 * @param label The label part of the name
 * @param namespace The namespace part of the name
 * @returns The EIP-712 signature
 */
export async function signRegisterNameAuth(
  xns: XNS,
  signer: SignerWithAddress,
  recipient: string,
  label: string,
  namespace: string
): Promise<string> {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = {
    name: "XNS",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: await xns.getAddress(),
  };

  const types = {
    RegisterNameAuth: [
      { name: "recipient", type: "address" },
      { name: "label", type: "string" },
      { name: "namespace", type: "string" },
    ],
  };

  const value = {
    recipient: recipient,
    label: label,
    namespace: namespace,
  };

  return await signer.signTypedData(domain, types, value);
}

