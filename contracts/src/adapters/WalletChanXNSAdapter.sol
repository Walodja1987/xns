// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "../interfaces/IXNS.sol";

/// @title WalletChanXNSAdapter
/// @author Wladimir Weinbender (DIVA Technologies AG)
/// @notice WalletChan-specific adapter in front of XNS.
/// It forwards XNS resolution except for the namespaces "mega" and "wei",
/// which are intentionally blocked inside WalletChan to avoid overlap/confusion
/// with WalletChan-native naming conventions.
/// The "eth" namespace is disallowed inside the original XNS and does not require special handling.
///
/// Behavior:
/// - Bare names (e.g. "alice") are forwarded to XNS unchanged
/// - Names in blocked namespaces (e.g. "alice.mega", "bob.wei") resolve to address(0)
/// - Reverse lookup returns an empty string if the resolved XNS name ends in ".mega" or ".wei"
///
/// Deployment:
/// - Constructor is `payable`: forwards `msg.value` to `registerName` (no on-chain price check; saves gas).
/// - Registers this contract as `walletchanadapter.xns` (XNS allows only lowercase labels).
/// - The public `xns` namespace must exist, be public, and be past its exclusivity period.
/// - **Send exactly the name price in wei** (0.001 ETH on Ethereum mainnet for `xns`). Overpayment triggers an XNS refund to this contract, which has no `receive()` and will revert; underpayment also reverts.
contract WalletChanXNSAdapter {
    IXNS public immutable XNS;

    bytes32 private constant _MEGA_HASH = keccak256(bytes("mega"));
    bytes32 private constant _WEI_HASH = keccak256(bytes("wei"));

    /// @dev On Ethereum mainnet, send **exactly 0.001 ETH** (`1e15` wei) so XNS does not refund; this contract has no `receive()`, so excess payment causes refund + revert.
    ///      Other networks: match `xns` price exactly. Too little → `XNS: insufficient payment`.
    constructor(address xns) payable {
        require(xns != address(0), "WalletChanAdapter: zero XNS");
        XNS = IXNS(xns);
        XNS.registerName{value: msg.value}("walletchanadapter", "xns");
    }

    /// @notice Resolve a full name like "alice", "alice.x", "alice.gm", "alice.mega".
    /// Returns address(0) for blocked WalletChan-reserved namespaces.
    function getAddress(string calldata fullName) external view returns (address) {
        string memory namespace = _extractNamespace(fullName);

        // Bare name => forward to XNS
        if (bytes(namespace).length == 0) {
            return XNS.getAddress(fullName);
        }

        if (_isBlockedNamespace(namespace)) {
            return address(0);
        }

        return XNS.getAddress(fullName);
    }

    /// @notice Resolve using separate label and namespace parameters.
    /// Use empty namespace for bare names.
    function getAddress(string calldata label, string calldata namespace) external view returns (address) {
        if (bytes(namespace).length != 0 && _isBlockedNamespace(namespace)) {
            return address(0);
        }

        return XNS.getAddress(label, namespace);
    }

    /// @notice Reverse lookup through XNS, but hide blocked namespaces inside WalletChan.
    /// Returns empty string if the XNS primary name ends in ".mega" or ".wei".
    function getName(address addr) external view returns (string memory) {
        string memory name = XNS.getName(addr);
        if (bytes(name).length == 0) {
            return "";
        }

        string memory namespace = _extractNamespace(name);

        // Bare name => keep as-is
        if (bytes(namespace).length == 0) {
            return name;
        }

        if (_isBlockedNamespace(namespace)) {
            return "";
        }

        return name;
    }

    /// @notice Helper for WalletChan UI / integrators.
    function isBlockedNamespace(string calldata namespace) external pure returns (bool) {
        return _isBlockedNamespace(namespace);
    }

    /// @dev Returns the namespace part after the last ".".
    /// Returns empty string if there is no dot (i.e. bare name).
    function _extractNamespace(string memory fullName) private pure returns (string memory) {
        bytes memory b = bytes(fullName);
        uint256 len = b.length;
        if (len == 0) return "";

        uint256 dotIndex = type(uint256).max;
        for (uint256 i = len; i > 0; i--) {
            if (b[i - 1] == 0x2E) {
                dotIndex = i - 1;
                break;
            }
        }

        if (dotIndex == type(uint256).max) {
            return "";
        }

        uint256 nsLen = len - dotIndex - 1;
        bytes memory nsBytes = new bytes(nsLen);
        for (uint256 i = 0; i < nsLen; i++) {
            nsBytes[i] = b[dotIndex + 1 + i];
        }

        return string(nsBytes);
    }

    function _isBlockedNamespace(string memory namespace) private pure returns (bool) {
        bytes32 nsHash = keccak256(bytes(namespace));
        return nsHash == _MEGA_HASH || nsHash == _WEI_HASH;
    }
}