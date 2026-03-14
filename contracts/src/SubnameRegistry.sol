// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";

/// @title SubnameRegistry
/// @notice Zero-cost subname registry for existing XNS names.
/// @dev Supports both display forms:
/// - `bob@hello.xns` (preferred visual distinction)
/// - `bob.hello.xns` (resolver-level compatibility)
///
/// Subname registration is free (no protocol fee), but transaction gas still applies.
contract SubnameRegistry {
    /// @notice XNS contract used as source of truth for parent names.
    IXNS public immutable xns;

    /// @notice Namespace associated with bare names in XNS.
    string public constant BARE_NAME_NAMESPACE = "x";

    /// @dev Mapping from subname key => subname owner.
    mapping(bytes32 => address) private _subnameToOwner;

    /// @dev Emitted when a subname is registered.
    event SubnameRegistered(
        string indexed subLabel,
        string indexed parentLabel,
        string indexed parentNamespace,
        address owner
    );

    /// @param xnsAddress Address of deployed XNS contract.
    constructor(address xnsAddress) {
        require(xnsAddress != address(0), "SubnameRegistry: zero xns");
        xns = IXNS(xnsAddress);
    }

    /// @notice Register a subname for `msg.sender` (zero protocol cost).
    /// @param subLabel Subname label (e.g., "bob").
    /// @param parentLabel Parent label (e.g., "hello").
    /// @param parentNamespace Parent namespace (e.g., "xns"). Use empty string for bare parent names.
    function registerSubname(
        string calldata subLabel,
        string calldata parentLabel,
        string calldata parentNamespace
    ) external {
        _registerSubnameFor(msg.sender, subLabel, parentLabel, parentNamespace);
    }

    /// @notice Register a subname for a custom `recipient` (zero protocol cost).
    /// @param recipient Recipient of the subname.
    /// @param subLabel Subname label (e.g., "bob").
    /// @param parentLabel Parent label (e.g., "hello").
    /// @param parentNamespace Parent namespace (e.g., "xns"). Use empty string for bare parent names.
    function registerSubnameFor(
        address recipient,
        string calldata subLabel,
        string calldata parentLabel,
        string calldata parentNamespace
    ) external {
        _registerSubnameFor(recipient, subLabel, parentLabel, parentNamespace);
    }

    /// @notice Register a subname using `sub@parent.namespace` format.
    /// @dev Examples:
    /// - `bob@hello.xns`
    /// - `bob@hello` (parent interpreted as bare name => `hello.x`)
    /// @param atName Subname in `@` format.
    function registerSubnameAt(string calldata atName) external {
        (string memory subLabel, string memory parentLabel, string memory parentNamespace) = _parseAtName(atName);
        _registerSubnameFor(msg.sender, subLabel, parentLabel, parentNamespace);
    }

    /// @notice Resolve a registered subname owner by separate parts.
    /// @param subLabel Subname label.
    /// @param parentLabel Parent label.
    /// @param parentNamespace Parent namespace. Use empty string for bare parent names.
    /// @return owner Address of subname owner, or zero address if not registered.
    function getSubnameOwner(
        string calldata subLabel,
        string calldata parentLabel,
        string calldata parentNamespace
    ) external view returns (address owner) {
        string memory ns = _normalizeNamespace(parentNamespace);
        return _subnameToOwner[_getSubnameKey(subLabel, parentLabel, ns)];
    }

    /// @notice Resolve a registered subname owner by `sub@parent.namespace` format.
    /// @param atName Subname in `@` format.
    /// @return owner Address of subname owner, or zero address if not registered.
    function getSubnameOwnerAt(string calldata atName) external view returns (address owner) {
        (string memory subLabel, string memory parentLabel, string memory parentNamespace) = _parseAtName(atName);
        return _subnameToOwner[_getSubnameKey(subLabel, parentLabel, parentNamespace)];
    }

    /// @notice Check if a sublabel is valid under XNS character rules.
    function isValidSubLabel(string calldata subLabel) external pure returns (bool isValid) {
        return _isValidLabelLike(subLabel);
    }

    function _registerSubnameFor(
        address recipient,
        string memory subLabel,
        string memory parentLabel,
        string memory parentNamespace
    ) private {
        if (bytes(parentNamespace).length == 0) {
            parentNamespace = BARE_NAME_NAMESPACE;
        }

        require(recipient != address(0), "SubnameRegistry: zero recipient");
        require(_isValidLabelLike(subLabel), "SubnameRegistry: invalid subLabel");
        require(_isValidLabelLike(parentLabel), "SubnameRegistry: invalid parent label");
        require(_isValidLabelLike(parentNamespace), "SubnameRegistry: invalid parent namespace");

        address parentOwner = xns.getAddress(parentLabel, parentNamespace);
        require(parentOwner != address(0), "SubnameRegistry: parent not found");

        bytes32 key = _getSubnameKey(subLabel, parentLabel, parentNamespace);
        require(_subnameToOwner[key] == address(0), "SubnameRegistry: subname exists");

        _subnameToOwner[key] = recipient;
        emit SubnameRegistered(subLabel, parentLabel, parentNamespace, recipient);
    }

    function _normalizeNamespace(string calldata parentNamespace) private pure returns (string memory) {
        if (bytes(parentNamespace).length == 0) {
            return BARE_NAME_NAMESPACE;
        }
        return parentNamespace;
    }

    function _getSubnameKey(
        string memory subLabel,
        string memory parentLabel,
        string memory parentNamespace
    ) private pure returns (bytes32 key) {
        key = keccak256(abi.encodePacked(subLabel, "@", parentLabel, ".", parentNamespace));
    }

    function _parseAtName(
        string calldata atName
    ) private pure returns (string memory subLabel, string memory parentLabel, string memory parentNamespace) {
        bytes memory b = bytes(atName);
        uint256 len = b.length;
        require(len > 0, "SubnameRegistry: empty");

        uint256 atIndex = type(uint256).max;
        for (uint256 i = 0; i < len; i++) {
            if (b[i] == 0x40) {
                require(atIndex == type(uint256).max, "SubnameRegistry: multiple @");
                atIndex = i;
            }
        }

        require(atIndex != type(uint256).max, "SubnameRegistry: missing @");
        require(atIndex > 0 && atIndex < len - 1, "SubnameRegistry: bad @ position");

        bytes memory sub = new bytes(atIndex);
        for (uint256 i = 0; i < atIndex; i++) {
            sub[i] = b[i];
        }
        subLabel = string(sub);

        bytes memory parentFull = new bytes(len - atIndex - 1);
        for (uint256 i = 0; i < parentFull.length; i++) {
            parentFull[i] = b[atIndex + 1 + i];
        }

        (parentLabel, parentNamespace) = _parseParentName(string(parentFull));
    }

    function _parseParentName(
        string memory parentFullName
    ) private pure returns (string memory parentLabel, string memory parentNamespace) {
        bytes memory b = bytes(parentFullName);
        uint256 len = b.length;
        require(len > 0, "SubnameRegistry: empty parent");

        uint256 dotCount = 0;
        uint256 dotIndex = type(uint256).max;
        for (uint256 i = 0; i < len; i++) {
            if (b[i] == 0x2E) {
                dotCount++;
                dotIndex = i;
            }
        }

        if (dotCount == 0) {
            parentLabel = parentFullName;
            parentNamespace = BARE_NAME_NAMESPACE;
            return (parentLabel, parentNamespace);
        }

        require(dotCount == 1, "SubnameRegistry: bad parent format");
        require(dotIndex > 0 && dotIndex < len - 1, "SubnameRegistry: bad parent format");

        bytes memory labelBytes = new bytes(dotIndex);
        for (uint256 i = 0; i < dotIndex; i++) {
            labelBytes[i] = b[i];
        }

        uint256 nsLen = len - dotIndex - 1;
        bytes memory nsBytes = new bytes(nsLen);
        for (uint256 i = 0; i < nsLen; i++) {
            nsBytes[i] = b[dotIndex + 1 + i];
        }

        parentLabel = string(labelBytes);
        parentNamespace = string(nsBytes);
    }

    /// @dev Same character rules as XNS label/namespace validation.
    function _isValidLabelLike(string memory value) private pure returns (bool isValid) {
        bytes memory b = bytes(value);
        uint256 len = b.length;
        if (len == 0 || len > 20) return false;

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2D);
            if (!(isLowercaseLetter || isDigit || isHyphen)) return false;

            if (isHyphen && i > 0 && b[i - 1] == 0x2D) return false;
        }

        if (b[0] == 0x2D || b[len - 1] == 0x2D) return false;
        return true;
    }
}
