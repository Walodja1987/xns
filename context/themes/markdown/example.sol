// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IDETH} from "./interfaces/IDETH.sol";

//////////////////////////////
//                          //
//    __   ___   _  _____   //
//   \ \ / / \ | |/ ____|   //
//    \ V /|  \| | (___     //
//     > < | . ` |\___ \    //
//    / . \| |\  |____) |   //
//   /_/ \_\_| \_|_____/    //
//                          //
//////////////////////////////

/// @title XNS
/// @author Wladimir Weinbender
/// @notice An Ethereum-native name registry that maps human-readable names to Ethereum addresses.
/// Names are **permanent, immutable, and non-transferable**.
///
/// Name format: [label].[namespace]
///
/// ### Name registration
/// - To register a name, users call `registerName(label)` and send ETH.
/// - The amount of ETH sent determines the namespace. It must match a namespace's registered price.
/// - Each address can own at most one name.
/// - Names are always linked to the recipient address and cannot be assigned without explicit authorization.
///
/// ### Sponsorship via authorization (EIP-712 + EIP-1271)
/// - `registerNameWithAuthorization` allows a sponsor (tx sender) to pay and register a name for a recipient
///   who explicitly authorized it via signature.
/// - During the namespace creator exclusivity window, only the namespace creator may sponsor registrations
///   in that namespace (public `registerName` is disabled).
///
/// ### Bare names
/// - Bare labels (e.g., "vitalik") are equivalent to names in the special "x" namespace: "vitalik" == "vitalik.x".
/// - Bare names cost 100 ETH (SPECIAL_NAMESPACE_PRICE).
///
/// ### Namespace registration
/// - Anyone can register new namespaces by paying a one-time fee of 200 ETH.
/// - Namespace creator has a 30-day exclusive window where public registrations are blocked; creator may sponsor
///   registrations via authorization.
/// - The XNS contract owner can register namespaces for free in the first year following deployment.
/// - "eth" namespace is disallowed to avoid confusion with ENS.
///
/// ### Ethereum-native economics
/// - 90% of ETH sent during name / namespace registration is burnt via the DETH contract.
/// - 10% is credited as fees to the namespace creator and the XNS contract owner (5% each).
contract XNS {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct NamespaceData {
        uint256 pricePerName;
        address creator;
        uint64 createdAt;
    }

    struct Name {
        string label;
        string namespace;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => address) private _nameHashToAddress; // keccak256(label,".",namespace) -> owner
    mapping(bytes32 => NamespaceData) private _namespaces; // keccak256(namespace) -> data
    mapping(uint256 => string) private _priceToNamespace; // pricePerName -> namespace
    mapping(address => Name) private _addressToName; // address -> (label, namespace)
    mapping(address => uint256) private _pendingFees; // address -> fees
    mapping(address => uint256) public nonces; // recipient -> nonce (for auth)

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    address public immutable OWNER;
    uint64 public immutable DEPLOYED_AT;

    uint256 public constant NAMESPACE_REGISTRATION_FEE = 200 ether;
    uint256 public constant NAMESPACE_CREATOR_EXCLUSIVE_PERIOD = 30 days;

    uint256 public constant INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD = 365 days;

    uint256 public constant PRICE_STEP = 1e15; // 0.001 ether

    string public constant SPECIAL_NAMESPACE = "x";
    uint256 public constant SPECIAL_NAMESPACE_PRICE = 100 ether;

    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    // EIP-712 / EIP-1271
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _NAME_HASH = keccak256("XNS");
    bytes32 private constant _VERSION_HASH = keccak256("1");

    // Recipient authorizes sponsorship of a paid registration at a specific pricePerName
    bytes32 private constant _REGISTER_AUTH_TYPEHASH =
        keccak256(
            "RegisterNameAuth(address recipient,bytes32 labelHash,bytes32 namespaceHash,uint256 pricePerName,uint256 nonce,uint256 deadline)"
        );

    bytes4 private constant _EIP1271_MAGICVALUE = 0x1626ba7e;

    // secp256k1n/2 for malleability check on 's'
    uint256 private constant _SECP256K1N_HALF = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator);
    event FeesClaimed(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner) {
        OWNER = owner;
        DEPLOYED_AT = uint64(block.timestamp);

        _namespaces[keccak256(bytes(SPECIAL_NAMESPACE))] = NamespaceData({
            pricePerName: SPECIAL_NAMESPACE_PRICE,
            creator: owner,
            createdAt: uint64(block.timestamp)
        });

        _priceToNamespace[SPECIAL_NAMESPACE_PRICE] = SPECIAL_NAMESPACE;

        emit NamespaceRegistered(SPECIAL_NAMESPACE, SPECIAL_NAMESPACE_PRICE, owner);
    }

    // =========================================================================
    // STATE-MODIFYING FUNCTIONS
    // =========================================================================

    /// @notice Register a paid name for `msg.sender`. Namespace is determined by `msg.value`.
    /// @dev During the namespace creator exclusivity period, public registration is disabled.
    function registerName(string calldata label) external payable {
        require(_isValidLabel(label), "XNS: invalid label");

        uint256 pricePerName = msg.value;
        require(pricePerName > 0, "XNS: zero price");

        string memory namespace = _priceToNamespace[pricePerName];
        require(bytes(namespace).length != 0, "XNS: non-existent namespace");

        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];

        // Public registrations are blocked during exclusivity.
        if (block.timestamp < ns.createdAt + NAMESPACE_CREATOR_EXCLUSIVE_PERIOD) {
            revert("XNS: namespace in exclusive period");
        }

        require(bytes(_addressToName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        _nameHashToAddress[key] = msg.sender;
        _addressToName[msg.sender] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, msg.sender);

        _burnETHAndCreditFees(msg.value, ns.creator);
    }

    /// @notice Sponsor a paid name registration for `recipient` who explicitly authorized it via signature.
    /// @dev During exclusivity, only the namespace creator may call this (i.e., sponsor).
    /// @param label The label to register.
    /// @param recipient The address that will receive the name.
    /// @param namespace The namespace string (must match `msg.value` mapping).
    /// @param deadline Timestamp after which this authorization is invalid.
    /// @param signature EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature.
    function registerNameWithAuthorization(
        string calldata label,
        address recipient,
        string calldata namespace,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        require(block.timestamp <= deadline, "XNS: expired");
        require(_isValidLabel(label), "XNS: invalid label");
        require(recipient != address(0), "XNS: 0x recipient");

        uint256 pricePerName = msg.value;
        require(pricePerName > 0, "XNS: zero price");

        // Namespace must match the price mapping (prevents “wrong namespace” sponsorship).
        string memory mapped = _priceToNamespace[pricePerName];
        require(bytes(mapped).length != 0, "XNS: non-existent namespace");
        require(keccak256(bytes(mapped)) == keccak256(bytes(namespace)), "XNS: namespace/price mismatch");

        bytes32 nsHash = keccak256(bytes(namespace));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        // During exclusivity, only namespace creator may sponsor registrations.
        if (block.timestamp < ns.createdAt + NAMESPACE_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: only creator can sponsor during exclusivity");
        }

        require(bytes(_addressToName[recipient].label).length == 0, "XNS: recipient already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        uint256 nonce = nonces[recipient];

        bytes32 structHash = keccak256(
            abi.encode(
                _REGISTER_AUTH_TYPEHASH,
                recipient,
                keccak256(bytes(label)),
                nsHash,
                pricePerName,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        require(_isValidSignature(recipient, digest, signature), "XNS: bad authorization");

        // consume nonce
        nonces[recipient] = nonce + 1;

        // mint
        _nameHashToAddress[key] = recipient;
        _addressToName[recipient] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, recipient);

        _burnETHAndCreditFees(msg.value, ns.creator);
    }

    /// @notice Register a new namespace.
    function registerNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(_isValidNamespace(namespace), "XNS: invalid namespace");
        require(keccak256(bytes(namespace)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");
        require(bytes(_priceToNamespace[pricePerName]).length == 0, "XNS: price already in use");

        bytes32 nsHash = keccak256(bytes(namespace));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        if (!(block.timestamp < DEPLOYED_AT + INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD && msg.sender == OWNER)) {
            require(msg.value == NAMESPACE_REGISTRATION_FEE, "XNS: wrong namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp)
        });

        _priceToNamespace[pricePerName] = namespace;

        emit NamespaceRegistered(namespace, pricePerName, msg.sender);

        if (msg.value > 0) {
            _burnETHAndCreditFees(msg.value, msg.sender);
        }
    }

    /// @notice Register a namespace and immediately mint one founder name to `msg.sender`.
    /// @dev Founder name is "free" (no per-name burn); only the namespace fee applies (if any).
    function registerNamespaceWithName(
        string calldata namespace,
        uint256 pricePerName,
        string calldata label
    ) external payable {
        require(_isValidNamespace(namespace), "XNS: invalid namespace");
        require(_isValidLabel(label), "XNS: invalid label");
        require(keccak256(bytes(namespace)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");
        require(bytes(_priceToNamespace[pricePerName]).length == 0, "XNS: price already in use");

        bytes32 nsHash = keccak256(bytes(namespace));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        require(bytes(_addressToName[msg.sender].label).length == 0, "XNS: address already has a name");

        if (!(block.timestamp < DEPLOYED_AT + INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD && msg.sender == OWNER)) {
            require(msg.value == NAMESPACE_REGISTRATION_FEE, "XNS: wrong namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp)
        });

        _priceToNamespace[pricePerName] = namespace;

        emit NamespaceRegistered(namespace, pricePerName, msg.sender);

        // Founder name mint to self (free)
        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        _nameHashToAddress[key] = msg.sender;
        _addressToName[msg.sender] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, msg.sender);

        if (msg.value > 0) {
            _burnETHAndCreditFees(msg.value, msg.sender);
        }
    }

    function claimFees(address recipient) external {
        require(recipient != address(0), "XNS: zero recipient");
        _claimFees(recipient);
    }

    function claimFeesToSelf() external {
        _claimFees(msg.sender);
    }

    function _claimFees(address recipient) private {
        uint256 amount = _pendingFees[msg.sender];
        require(amount > 0, "XNS: no fees to claim");

        _pendingFees[msg.sender] = 0;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "XNS: fee transfer failed");

        emit FeesClaimed(recipient, amount);
    }

    // =========================================================================
    // GETTER / VIEW FUNCTIONS
    // =========================================================================

    function getAddress(string calldata fullName) external view returns (address addr) {
        bytes memory b = bytes(fullName);
        uint256 len = b.length;
        if (len == 0) return address(0);

        uint256 endExclusive = (len > 5) ? (len - 5) : 0;
        int256 lastDot = -1;

        for (uint256 i = len - 1; i > endExclusive; i--) {
            if (b[i] == 0x2E) {
                lastDot = int256(i);
                break;
            }
        }

        string memory label;
        string memory namespace;

        if (lastDot == -1) {
            label = fullName;
            namespace = SPECIAL_NAMESPACE;
        } else {
            uint256 dotIndex = uint256(lastDot);

            bytes memory bl = new bytes(dotIndex);
            for (uint256 j = 0; j < dotIndex; j++) bl[j] = b[j];

            uint256 nsLen = len - dotIndex - 1;
            bytes memory bn = new bytes(nsLen);
            for (uint256 j = 0; j < nsLen; j++) bn[j] = b[dotIndex + 1 + j];

            label = string(bl);
            namespace = string(bn);
        }

        return _getAddress(label, namespace);
    }

    function getAddress(string calldata label, string calldata namespace) external view returns (address addr) {
        return _getAddress(label, namespace);
    }

    function _getAddress(string memory label, string memory namespace) private view returns (address addr) {
        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        return _nameHashToAddress[key];
    }

    function getName(address addr) external view returns (string memory) {
        Name storage n = _addressToName[addr];

        if (bytes(n.label).length == 0) return "";

        if (keccak256(bytes(n.namespace)) == keccak256(bytes(SPECIAL_NAMESPACE))) {
            return n.label;
        }

        return string.concat(n.label, ".", n.namespace);
    }

    function getNamespaceInfo(
        string calldata namespace
    ) external view returns (uint256 pricePerName, address creator, uint64 createdAt) {
        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        return (ns.pricePerName, ns.creator, ns.createdAt);
    }

    function getNamespaceInfo(
        uint256 price
    ) external view returns (string memory namespace, uint256 pricePerName, address creator, uint64 createdAt) {
        namespace = _priceToNamespace[price];
        require(bytes(namespace).length != 0, "XNS: price not mapped to namespace");

        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");

        return (namespace, ns.pricePerName, ns.creator, ns.createdAt);
    }

    function isValidLabel(string memory label) external pure returns (bool isValid) {
        return _isValidLabel(label);
    }

    function isValidNamespace(string memory namespace) external pure returns (bool isValid) {
        return _isValidNamespace(namespace);
    }

    function getPendingFees(address recipient) external view returns (uint256 amount) {
        return _pendingFees[recipient];
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _burnETHAndCreditFees(uint256 totalAmount, address namespaceCreator) private {
        uint256 burnAmount = (totalAmount * 90) / 100;
        uint256 creatorFee = (totalAmount * 5) / 100;
        uint256 ownerFee = totalAmount - burnAmount - creatorFee;

        IDETH(DETH).burn{value: burnAmount}(msg.sender);

        _pendingFees[namespaceCreator] += creatorFee;
        _pendingFees[OWNER] += ownerFee;
    }

    function _isValidLabel(string memory label) private pure returns (bool isValid) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len == 0 || len > 20) return false;

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2D);
            if (!(isLowercaseLetter || isDigit || isHyphen)) return false;
        }

        if (b[0] == 0x2D || b[len - 1] == 0x2D) return false;

        return true;
    }

    function _isValidNamespace(string memory namespace) private pure returns (bool isValid) {
        bytes memory b = bytes(namespace);
        uint256 len = b.length;
        if (len == 0 || len > 4) return false;

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            if (!(isLowercaseLetter || isDigit)) return false;
        }

        return true;
    }

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(_EIP712_DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, block.chainid, address(this)));
    }

    function _isValidSignature(address signer, bytes32 digest, bytes calldata sig) private view returns (bool) {
        if (signer.code.length == 0) {
            (bytes32 r, bytes32 s, uint8 v) = _splitSig(sig);
            if (uint256(s) > _SECP256K1N_HALF) return false;
            if (v != 27 && v != 28) return false;

            address recovered = ecrecover(digest, v, r, s);
            return recovered != address(0) && recovered == signer;
        } else {
            (bool ok, bytes memory ret) = signer.staticcall(
                abi.encodeWithSignature("isValidSignature(bytes32,bytes)", digest, sig)
            );
            return ok && ret.length >= 4 && bytes4(ret) == _EIP1271_MAGICVALUE;
        }
    }

    function _splitSig(bytes calldata sig) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "XNS: bad sig length");
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
    }
}
