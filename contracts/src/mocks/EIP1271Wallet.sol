// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title EIP1271Wallet
/// @notice Mock contract wallet that implements EIP-1271 for testing purposes
contract EIP1271Wallet {
    using ECDSA for bytes32;

    /// @notice The owner of this wallet (EOA that controls the wallet)
    address public owner;

    /// @notice EIP-1271 magic value returned when signature is valid
    bytes4 public constant MAGIC_VALUE = bytes4(0x1626ba7e);

    /// @notice EIP-1271 magic value returned when signature is invalid
    bytes4 public constant INVALID_SIGNATURE = bytes4(0xffffffff);

    /// @notice Constructor sets the owner
    /// @param _owner The address that will control this wallet
    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice EIP-1271 function to validate signatures
    /// @param hash The message hash that was signed
    /// @param signature The signature to validate
    /// @return magicValue Returns MAGIC_VALUE if signature is valid, INVALID_SIGNATURE otherwise
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue) {
        // Recover the signer from the hash and signature
        address signer = hash.recover(signature);
        
        // Check if the signer is the owner
        if (signer == owner) {
            return MAGIC_VALUE;
        }
        
        return INVALID_SIGNATURE;
    }
}

