// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "../interfaces/IXNS.sol";
import {IWalletChanXNSAdapter} from "../interfaces/IWalletChanXNSAdapter.sol";

/// @title WalletChanXNSAdapter
/// @author Wladimir Weinbender (DIVA Technologies AG)
/// @notice WalletChan-specific adapter in front of XNS.
/// It forwards XNS resolution except for the namespaces "mega" and "wei", which are intentionally 
/// blocked to avoid overlap/confusion with WalletChan's existing naming integrations.
/// The "eth" namespace is disallowed inside the original XNS and does not require special handling.
///
/// Behavior:
/// - Names ending in ".mega" or ".wei" resolve to address(0)
/// - All other names (including bare names) are forwarded to XNS unchanged
/// - Reverse lookup (address -> name) returns an empty string if the resolved XNS name ends in ".mega" or ".wei"
///
/// The deployed adapter registers itself on XNS as `walletchanadapter.xns`.
contract WalletChanXNSAdapter is IWalletChanXNSAdapter {
    IXNS public immutable XNS;

    bytes32 private constant _MEGA_HASH = keccak256(bytes("mega"));
    bytes32 private constant _WEI_HASH = keccak256(bytes("wei"));

    constructor(address xns) payable {
        require(xns != address(0), "WalletChanAdapter: 0x XNS");
        XNS = IXNS(xns);
        XNS.registerName{value: msg.value}("walletchanadapter", "xns");
    }

    /// @notice Resolve a full name like "alice", "alice.x", "alice.gm", "alice.mega".
    /// Returns address(0) if the name ends with ".mega" or ".wei".
    /// @param fullName The full name to resolve.
    /// @return The address associated with the full name, or address(0) if not found
    /// or the name ends with ".mega" or ".wei".
    function getAddress(string calldata fullName) external view returns (address) {
        if (_hasBlockedNamespaceSuffix(bytes(fullName))) {
            return address(0);
        }
        return XNS.getAddress(fullName);
    }

    /// @notice Resolve using separate label and namespace parameters.
    /// Use "" or "x" namespace for bare names.
    /// @param label The label to resolve.
    /// @param namespace The namespace to resolve.
    /// @return The address associated with the label and namespace, or address(0) if not found
    /// or the namespace is "mega" or "wei".
    function getAddress(string calldata label, string calldata namespace) external view returns (address) {
        if (_isBlockedNamespace(namespace)) {
            return address(0);
        }
        return XNS.getAddress(label, namespace);
    }

    /// @notice Reverse lookup (address -> name) through XNS. Returns empty string if the resolved XNS
    /// name ends in ".mega" or ".wei".
    /// @param addr The address to lookup.
    /// @return The full name associated with the address, or empty string if not found
    /// or the name ends with ".mega" or ".wei".
    function getName(address addr) external view returns (string memory) {
        string memory fullName = XNS.getName(addr);
        if (bytes(fullName).length == 0) {
            return "";
        }

        if (_hasBlockedNamespaceSuffix(bytes(fullName))) {
            return "";
        }

        return fullName;
    }

    /// @notice Helper function to check if a namespace is blocked (i.e. "mega" or "wei").
    /// @param namespace The namespace to check.
    /// @return True if the namespace is "mega" or "wei", false otherwise.
    function isBlockedNamespace(string calldata namespace) external pure returns (bool) {
        return _isBlockedNamespace(namespace);
    }

    /// @dev Helper function to check if a namespace is blocked (i.e. "mega" or "wei").
    /// @param namespace The namespace to check.
    /// @return True if the namespace is "mega" or "wei", false otherwise.
    function _isBlockedNamespace(string memory namespace) private pure returns (bool) {
        bytes32 nsHash = keccak256(bytes(namespace));
        return nsHash == _MEGA_HASH || nsHash == _WEI_HASH;
    }

    /// @dev Private helper to check if a full name ends with ".mega" or ".wei".
    /// @param b The full name to check.
    /// @return True if the full name ends with ".mega" or ".wei", false otherwise.
    function _hasBlockedNamespaceSuffix(bytes memory b) private pure returns (bool) {
        uint256 n = b.length;
        // ".mega" — 5 bytes
        if (n >= 5) {
            unchecked {
                if (
                    b[n - 5] == 0x2E && b[n - 4] == 0x6D && b[n - 3] == 0x65 && b[n - 2] == 0x67 && b[n - 1] == 0x61
                ) {
                    return true;
                }
            }
        }
        // ".wei" — 4 bytes
        if (n >= 4) {
            unchecked {
                if (b[n - 4] == 0x2E && b[n - 3] == 0x77 && b[n - 2] == 0x65 && b[n - 1] == 0x69) {
                    return true;
                }
            }
        }
        return false;
    }
}
