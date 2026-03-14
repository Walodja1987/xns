// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";

interface ISubnameRegistry {
    function getSubnameOwner(
        string calldata subLabel,
        string calldata parentLabel,
        string calldata parentNamespace
    ) external view returns (address owner);

    function getSubnameOwner(string calldata fullSubname) external view returns (address owner);
}

/// @title UniversalResolver
/// @notice Resolver that supports:
/// - Top-level XNS names (`hello.xns`, `vitalik`)
/// - Subnames via `@` format (`bob@hello.xns`)
contract UniversalResolver {
    IXNS public immutable xns;
    ISubnameRegistry public immutable subnameRegistry;

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
        return subnameRegistry.getSubnameOwner(atName);
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
