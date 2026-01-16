// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IXNS} from "../interfaces/IXNS.sol";

/// @title MockERC20B
/// @notice Mock ERC20 contract that demonstrates how to assign a name to an ERC20 token contract via
/// a separate `registerName` function.
contract MockERC20B is ERC20 {
    IXNS public immutable xns;

    /// @notice Constructor
    /// @param _name Token name
    /// @param _symbol Token symbol
    /// @param _xns The XNS contract address
    /// @param _initialSupply Initial token supply
    constructor(
        string memory _name,
        string memory _symbol,
        address _xns,
        uint256 _initialSupply
    ) ERC20(_name, _symbol) {
        xns = IXNS(_xns);
        _mint(msg.sender, _initialSupply);
    }

    /// @notice Register an XNS name for this contract
    /// @param label The label to register (e.g., "myprotocol")
    /// @param namespace The namespace to register in (e.g., "xns")
    /// @dev Any excess payment is refunded by XNS to this contract
    function registerName(string calldata label, string calldata namespace) external payable {
        xns.registerName{value: msg.value}(label, namespace);
    }

    /// @notice Optional: Accept ETH refunds from XNS if excess payment is sent.
    /// Not needed if correct prices is sent, without any excess.
    receive() external payable {}
}

