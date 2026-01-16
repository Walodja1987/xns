// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MockERC20C
/// @notice Mock ERC20 contract that demonstrates how to assign a name to an ERC20 token contract via
/// EIP-1271. The name is registered via sponsored registration using `registerNameWithAuthorization` or
/// `batchRegisterNameWithAuthorization` functions.
contract MockERC20C is ERC20 {
    using ECDSA for bytes32;

    /// @notice The owner of this contract (EOA that controls the contract)
    address public owner;

    /// @notice EIP-1271 magic value returned when signature is valid
    bytes4 public constant MAGIC_VALUE = bytes4(0x1626ba7e);

    /// @notice EIP-1271 magic value returned when signature is invalid
    bytes4 public constant INVALID_SIGNATURE = bytes4(0xffffffff);

    /// @notice Constructor
    /// @param _name Token name
    /// @param _symbol Token symbol
    /// @param _owner The address that will control this contract
    /// @param _initialSupply Initial token supply
    constructor(
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _initialSupply
    ) ERC20(_name, _symbol) {
        owner = _owner;
        _mint(_owner, _initialSupply);
    }

    /// @notice EIP-1271 function to validate signatures. The name is registered via sponsored registration
    /// using `registerNameWithAuthorization` / `batchRegisterNameWithAuthorization` functions.
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

    /// Note: No receive() function needed - refunds go to sponsor, not this contract
}

