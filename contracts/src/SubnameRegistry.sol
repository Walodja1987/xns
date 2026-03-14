// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title SubnameRegistry
/// @notice Zero-cost subname registry for existing XNS names.
/// @dev Subnames use `@` format (e.g., `bob@hello.xns`).
///
/// Subname registration is free (no protocol fee), but transaction gas still applies.
contract SubnameRegistry is EIP712 {
    /// @notice XNS contract used as source of truth for parent names.
    IXNS public immutable xns;

    /// @notice Namespace associated with bare names in XNS.
    string public constant BARE_NAME_NAMESPACE = "x";

    /// @dev Mapping from subname key => subname owner.
    mapping(bytes32 => address) private _subnameToOwner;

    /// @dev Per parent-name setting. False (default) means owner-only registration.
    mapping(bytes32 => bool) private _isPublicSubnameRegistration;

    /// @dev EIP-712 struct type hash for `RegisterSubnameAuth`.
    bytes32 private constant _REGISTER_SUBNAME_AUTH_TYPEHASH =
        keccak256("RegisterSubnameAuth(address recipient,string subLabel,string parentLabel,string parentNamespace)");

    /// @dev Argument for `registerSubnameWithAuthorization`.
    struct RegisterSubnameAuth {
        address recipient;
        string subLabel;
        string parentLabel;
        string parentNamespace;
    }

    /// @dev Emitted when a subname is registered.
    event SubnameRegistered(
        string indexed subLabel,
        string indexed parentLabel,
        string indexed parentNamespace,
        address owner
    );

    /// @dev Emitted when subname registration mode is updated for a parent name.
    event SubnameRegistrationModeSet(string indexed parentLabel, string indexed parentNamespace, bool isPublic);

    /// @param xnsAddress Address of deployed XNS contract.
    constructor(address xnsAddress) EIP712("SubnameRegistry", "1") {
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
        _registerSubname(msg.sender, msg.sender, subLabel, parentLabel, parentNamespace);
    }

    /// @notice Sponsor registration for a recipient who authorizes it via EIP-712 signature.
    /// @dev By default, only parent owner can call this. If parent enables public mode, anyone can sponsor.
    function registerSubnameWithAuthorization(
        RegisterSubnameAuth calldata registerSubnameAuth,
        bytes calldata signature
    ) external {
        require(registerSubnameAuth.recipient != address(0), "SubnameRegistry: zero recipient");
        require(_isValidSignature(registerSubnameAuth, signature), "SubnameRegistry: bad authorization");

        _registerSubname(
            msg.sender,
            registerSubnameAuth.recipient,
            registerSubnameAuth.subLabel,
            registerSubnameAuth.parentLabel,
            registerSubnameAuth.parentNamespace
        );
    }

    /// @notice Set whether subname registration is open to everyone for a parent name.
    /// @dev Default is owner-only (`isPublic = false`).
    function setPublicSubnameRegistration(
        string calldata parentLabel,
        string calldata parentNamespace,
        bool isPublic
    ) external {
        string memory ns = _normalizeNamespace(parentNamespace);
        _requireValidParent(parentLabel, ns);

        address parentOwner = xns.getAddress(parentLabel, ns);
        require(parentOwner != address(0), "SubnameRegistry: parent not found");
        require(msg.sender == parentOwner, "SubnameRegistry: not parent owner");

        _isPublicSubnameRegistration[_getParentKey(parentLabel, ns)] = isPublic;
        emit SubnameRegistrationModeSet(parentLabel, ns, isPublic);
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
    /// @param fullSubname Subname in `@` format.
    /// @return owner Address of subname owner, or zero address if not registered.
    function getSubnameOwner(string calldata fullSubname) external view returns (address owner) {
        (string memory subLabel, string memory parentLabel, string memory parentNamespace) = _parseAtName(fullSubname);
        return _subnameToOwner[_getSubnameKey(subLabel, parentLabel, parentNamespace)];
    }

    /// @notice Check whether a parent name currently allows public subname registration.
    function isPublicSubnameRegistration(
        string calldata parentLabel,
        string calldata parentNamespace
    ) external view returns (bool isPublic) {
        string memory ns = _normalizeNamespace(parentNamespace);
        return _isPublicSubnameRegistration[_getParentKey(parentLabel, ns)];
    }

    /// @notice Check if a sublabel is valid under XNS character rules.
    function isValidSubLabel(string calldata subLabel) external pure returns (bool isValid) {
        return _isValidLabelLike(subLabel);
    }

    /// @notice Validate signature for register-subname authorization.
    function isValidSignature(
        RegisterSubnameAuth calldata registerSubnameAuth,
        bytes calldata signature
    ) external view returns (bool isValid) {
        return _isValidSignature(registerSubnameAuth, signature);
    }

    function _registerSubname(
        address operator,
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
        _requireValidParent(parentLabel, parentNamespace);

        address parentOwner = xns.getAddress(parentLabel, parentNamespace);
        require(parentOwner != address(0), "SubnameRegistry: parent not found");
        if (!_isPublicSubnameRegistration[_getParentKey(parentLabel, parentNamespace)]) {
            require(operator == parentOwner, "SubnameRegistry: not parent owner");
        }

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

    function _getParentKey(string memory parentLabel, string memory parentNamespace) private pure returns (bytes32 key) {
        key = keccak256(abi.encodePacked(parentLabel, ".", parentNamespace));
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

    function _requireValidParent(string memory parentLabel, string memory parentNamespace) private pure {
        require(_isValidLabelLike(parentLabel), "SubnameRegistry: invalid parent label");
        require(_isValidLabelLike(parentNamespace), "SubnameRegistry: invalid parent namespace");
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

    function _isValidSignature(
        RegisterSubnameAuth calldata registerSubnameAuth,
        bytes calldata signature
    ) private view returns (bool isValid) {
        bytes32 digest = _hashTypedDataV4(_getRegisterSubnameAuthHash(registerSubnameAuth));
        return SignatureChecker.isValidSignatureNow(registerSubnameAuth.recipient, digest, signature);
    }

    function _getRegisterSubnameAuthHash(
        RegisterSubnameAuth calldata registerSubnameAuth
    ) private pure returns (bytes32 registerSubnameAuthHash) {
        registerSubnameAuthHash = keccak256(
            abi.encode(
                _REGISTER_SUBNAME_AUTH_TYPEHASH,
                registerSubnameAuth.recipient,
                keccak256(bytes(registerSubnameAuth.subLabel)),
                keccak256(bytes(registerSubnameAuth.parentLabel)),
                keccak256(bytes(registerSubnameAuth.parentNamespace))
            )
        );
    }
}
