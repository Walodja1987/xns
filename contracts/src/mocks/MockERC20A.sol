// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IXNS} from "../interfaces/IXNS.sol";

/// @title MockERC20A
/// @notice Mock ERC20 contract that demonstrates how to assign a name to an ERC20 token contract by
/// calling the `registerName` function inside the constructor.
contract MockERC20A is ERC20 {
    /// @notice Constructor that optionally registers an XNS name
    /// @param _name Token name
    /// @param _symbol Token symbol
    /// @param _xns The XNS contract address
    /// @param _initialSupply Initial token supply
    /// @param label The label to register (empty string to skip registration)
    /// @param namespace The namespace to register in (ignored if label is empty)
    constructor(
        string memory _name,
        string memory _symbol,
        address _xns,
        uint256 _initialSupply,
        string memory label,
        string memory namespace
    ) ERC20(_name, _symbol) payable {
        _mint(msg.sender, _initialSupply);
        
        // If label is provided, register the name in constructor
        if (bytes(label).length > 0) {
            IXNS(_xns).registerName{value: msg.value}(label, namespace);
        }
    }

    /// @notice Optional: Accept ETH refunds from XNS if excess payment is sent.
    /// Not needed if correct price is sent, without any excess.
    receive() external payable {}
}

