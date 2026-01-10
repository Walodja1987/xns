// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "../interfaces/IXNS.sol";

/// @title SelfRegisteringContract
/// @notice Mock contract that can register a name for itself via registerName
contract SelfRegisteringContract {
    IXNS public xns;

    /// @notice Constructor that optionally registers a name
    /// @param _xns The XNS contract address
    /// @param label The label to register (empty string to skip registration)
    /// @param namespace The namespace to register in (ignored if label is empty)
    constructor(address _xns, string memory label, string memory namespace) payable {
        xns = IXNS(_xns);
        
        // If label is provided, register the name in constructor
        if (bytes(label).length > 0) {
            xns.registerName{value: msg.value}(label, namespace);
        }
    }

    /// @notice Function to register a name after deployment
    /// @param label The label to register
    /// @param namespace The namespace to register in
    function registerName(string calldata label, string calldata namespace) external payable {
        xns.registerName{value: msg.value}(label, namespace);
    }

    /// @notice Receive function to accept ETH refunds from XNS
    receive() external payable {}
}

