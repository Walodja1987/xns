// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";

interface ISubnameRegistry {
    function getSubnameOwner(
        string calldata subLabel,
        string calldata parentLabel,
        string calldata parentNamespace
    ) external view returns (address owner);

    function getSubnameOwnerAt(string calldata atName) external view returns (address owner);
}

/// @title UniversalResolver
/// @notice Resolver that supports:
/// - Top-level XNS names (`hello.xns`, `vitalik`)
/// - Subnames via `@` format (`bob@hello.xns`)
contract UniversalResolver {
    IXNS public immutable xns;
    ISubnameRegistry public immutable subnameRegistry;

    /// @notice Namespace associated with bare names in XNS.
    string public constant BARE_NAME_NAMESPACE = "x";

    constructor(address xnsAddress, address subnameRegistryAddress) {
        require(xnsAddress != address(0), "UniversalResolver: zero xns");
        require(subnameRegistryAddress != address(0), "UniversalResolver: zero subnameRegistry");
        xns = IXNS(xnsAddress);
        subnameRegistry = ISubnameRegistry(subnameRegistryAddress);
    }

    /// @notice Resolve XNS or subname formats to an address.
    /// @dev Returns `address(0)` for malformed/unknown names.
    function resolve(string calldata name) external view returns (address) {
        bytes memory b = bytes(name);
        if (b.length == 0) return address(0);

        if (_containsAt(b)) {
            return _resolveAt(name);
        }

        uint256 dotCount = _countDot(b);
        if (dotCount <= 1) {
            return xns.getAddress(name);
        }

        return address(0);
    }

    /// @notice Resolve `sub@parent.namespace` style names.
    /// @dev Returns `address(0)` for malformed names.
    function resolveAt(string calldata atName) external view returns (address) {
        return _resolveAt(atName);
    }

    function _resolveAt(string calldata atName) private view returns (address) {
        (bool ok, string memory subLabel, string memory parentLabel, string memory parentNamespace) = _tryParseAtName(atName);
        if (!ok) return address(0);
        return subnameRegistry.getSubnameOwner(subLabel, parentLabel, parentNamespace);
    }

    function _tryParseAtName(
        string calldata atName
    ) private pure returns (bool ok, string memory subLabel, string memory parentLabel, string memory parentNamespace) {
        bytes memory b = bytes(atName);
        uint256 len = b.length;
        if (len == 0) return (false, "", "", "");

        uint256 atIndex = type(uint256).max;
        for (uint256 i = 0; i < len; i++) {
            if (b[i] == 0x40) {
                if (atIndex != type(uint256).max) return (false, "", "", "");
                atIndex = i;
            }
        }

        if (atIndex == type(uint256).max || atIndex == 0 || atIndex >= len - 1) {
            return (false, "", "", "");
        }

        bytes memory sub = new bytes(atIndex);
        for (uint256 i = 0; i < atIndex; i++) {
            sub[i] = b[i];
        }
        subLabel = string(sub);

        bytes memory parentFull = new bytes(len - atIndex - 1);
        for (uint256 i = 0; i < parentFull.length; i++) {
            parentFull[i] = b[atIndex + 1 + i];
        }

        (ok, parentLabel, parentNamespace) = _tryParseParentName(string(parentFull));
        return (ok, subLabel, parentLabel, parentNamespace);
    }

    /// @dev Parent format must be either:
    /// - `label.namespace`, or
    /// - `label` (treated as bare parent name => namespace `x`).
    function _tryParseParentName(
        string memory parentFullName
    ) private pure returns (bool ok, string memory parentLabel, string memory parentNamespace) {
        bytes memory b = bytes(parentFullName);
        uint256 len = b.length;
        if (len == 0) return (false, "", "");

        uint256 dotCount = 0;
        uint256 dotIndex = type(uint256).max;
        for (uint256 i = 0; i < len; i++) {
            if (b[i] == 0x2E) {
                dotCount++;
                dotIndex = i;
            }
        }

        if (dotCount == 0) {
            return (true, parentFullName, BARE_NAME_NAMESPACE);
        }

        if (dotCount != 1 || dotIndex == 0 || dotIndex == len - 1) {
            return (false, "", "");
        }

        bytes memory labelBytes = new bytes(dotIndex);
        for (uint256 i = 0; i < dotIndex; i++) {
            labelBytes[i] = b[i];
        }

        uint256 nsLen = len - dotIndex - 1;
        bytes memory nsBytes = new bytes(nsLen);
        for (uint256 i = 0; i < nsLen; i++) {
            nsBytes[i] = b[dotIndex + 1 + i];
        }

        return (true, string(labelBytes), string(nsBytes));
    }

    function _containsAt(bytes memory b) private pure returns (bool containsAt) {
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == 0x40) return true;
        }
        return false;
    }

    function _countDot(bytes memory b) private pure returns (uint256 dotCount) {
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == 0x2E) dotCount++;
        }
    }
}
