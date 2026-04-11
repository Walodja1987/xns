// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "./IXNS.sol";

/// @title IWalletChanXNSAdapter
/// @notice Interface for the WalletChan adapter in front of XNS (blocked `.mega` / `.wei` namespaces).
interface IWalletChanXNSAdapter {
    function XNS() external view returns (IXNS);

    function getAddress(string calldata fullName) external view returns (address);

    function getAddress(string calldata label, string calldata namespace) external view returns (address);

    function getName(address addr) external view returns (string memory);

    function isBlockedNamespace(string calldata namespace) external pure returns (bool);
}
