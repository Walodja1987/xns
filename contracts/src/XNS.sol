// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IDETH} from "./IDETH.sol";

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

/// @title XNSRegistry
/// @notice Ethereum-only name registry: ETH amount -> namespace, (label, namespace) -> address.
/// @dev
/// - Names are immutable and non-transferable.
/// - ETH amount per name determines the namespace via a price mapping.
/// - Anyone can register new namespaces by paying a one-time fee
///   (except the contract creator, who pays no namespace fee in the first year).
/// - Namespace creator gets a 1-month exclusive period for paid registrations.
/// - Namespace creator can assign up to 200 free names per namespace (at any time).
/// - Each address can own at most one XNS name globally.
/// - "eth" namespace is forbidden to avoid confusion with ENS.
/// - Bare labels (e.g. "nike") are treated as "nike.x" (the special namespace).
contract XNSRegistry {
    // -------------------------------------------------------------------------
    // Types & Storage
    // -------------------------------------------------------------------------

    struct NamespaceData {
        uint256 pricePerName;
        address creator;
        uint64 createdAt;
        uint16 remainingFreeNames; // how many free names are still available (max 200 initially)
    }

    struct Claim {
        string label;
        address owner;
    }

    struct Name {
        string label;
        string namespace_;
    }

    /// @dev mapping from keccak256(label, ".", namespace) to owner address.
    mapping(bytes32 => address) private _records;

    /// @dev mapping from namespace hash to namespace metadata.
    mapping(bytes32 => NamespaceData) private _namespaces;

    /// @dev mapping from price-per-name (wei) to namespace string.
    mapping(uint256 => string) private _priceToNamespace;

    /// @dev reverse mapping: address -> (label, namespace).
    ///      If label is empty, the address has no name.
    mapping(address => Name) private _reverseName;

    /// @dev address of contract creator (deployer).
    address public immutable creator;

    /// @dev deployment timestamp.
    uint64 public immutable deployedAt;

    /// @dev flat fee to register a new namespace (in wei) for non-creator callers.
    uint256 public constant NAMESPACE_REGISTRATION_FEE = 200 ether;

    /// @dev maximum number of free names the creator can mint in their namespace.
    uint16 public constant MAX_FREE_NAMES_PER_NAMESPACE = 200;

    /// @dev duration of the exclusive namespace-creator window for paid registrations.
    uint256 public constant NS_CREATOR_EXCLUSIVE_PERIOD = 30 days;

    /// @dev period during which the contract creator pays no namespace fee.
    uint256 public constant CREATOR_FREE_NAMESPACE_PERIOD = 365 days;

    /// @dev unit price step (0.001 ETH).
    uint256 public constant PRICE_STEP = 1e15; // 0.001 ether

    /// @dev special namespace used for bare labels (e.g. "nike" => "nike.x").
    string public constant SPECIAL_NAMESPACE = "x";

    /// @dev price-per-name for the special namespace (bare names).
    uint256 public constant SPECIAL_NAMESPACE_PRICE = 100 ether;

    /// @dev Address of DETH contract used to burn ETH and credit the recipient.
    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event NameRegistered(
        string indexed label,
        string indexed namespace_,
        address indexed owner
    );

    event NamespaceRegistered(
        string indexed namespace_,
        uint256 pricePerName,
        address indexed creator
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() {
        creator = msg.sender;
        deployedAt = uint64(block.timestamp);

        // Register special namespace "x" as the very first namespace.
        bytes32 nsHash = keccak256(bytes(SPECIAL_NAMESPACE));
        _namespaces[nsHash] = NamespaceData({
            pricePerName: SPECIAL_NAMESPACE_PRICE,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            remainingFreeNames: MAX_FREE_NAMES_PER_NAMESPACE
        });

        _priceToNamespace[SPECIAL_NAMESPACE_PRICE] = SPECIAL_NAMESPACE;

        emit NamespaceRegistered(SPECIAL_NAMESPACE, SPECIAL_NAMESPACE_PRICE, msg.sender);
    }

    // =========================================================================
    // STATE-MODIFYING FUNCTIONS
    // =========================================================================

    /// @notice Register a new namespace and assign a price-per-name to it.
    /// @dev
    /// - Anyone can call this.
    /// - The contract creator pays no registration fee during the first year.
    /// - After that, and for everyone else, `msg.value` must be `NAMESPACE_REGISTRATION_FEE`.
    /// - `pricePerName` must be a positive multiple of 0.001 ETH.
    /// - `pricePerName` must not already be mapped to another namespace.
    /// - `namespace_` must be unique, 1–4 chars, only [a-z0-9], and not "eth".
    /// - The fee (if any) is burned.
    /// - The creator gets up to 200 free names for this namespace (usable anytime).
    function registerNamespace(
        string calldata namespace_,
        uint256 pricePerName
    ) external payable {
        _validateNamespace(namespace_);

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(!_eq(namespace_, "eth"), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(
            pricePerName % PRICE_STEP == 0,
            "XNS: price must be multiple of 0.001 ETH"
        );
        require(
            bytes(_priceToNamespace[pricePerName]).length == 0,
            "XNS: price already in use"
        );

        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage existing = _namespaces[nsHash];
        require(existing.creator == address(0), "XNS: namespace already exists");

        bool creatorDiscount = (
            msg.sender == creator &&
            block.timestamp < deployedAt + CREATOR_FREE_NAMESPACE_PERIOD
        );

        if (creatorDiscount) {
            require(msg.value == 0, "XNS: creator pays no fee in first year");
        } else {
            require(msg.value == NAMESPACE_REGISTRATION_FEE, "XNS: wrong namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            remainingFreeNames: MAX_FREE_NAMES_PER_NAMESPACE
        });

        _priceToNamespace[pricePerName] = namespace_;

        emit NamespaceRegistered(namespace_, pricePerName, msg.sender);

        _burn(msg.value, msg.sender);
    }

    /// @notice Register a single paid name for msg.sender.
    /// @dev
    /// - `msg.value` is the price-per-name and determines the namespace.
    /// - That price must already be mapped to a namespace via `registerNamespace`
    ///   or from the constructor (for the special namespace "x").
    /// - For the first NS_CREATOR_EXCLUSIVE_PERIOD of a namespace,
    ///   only the namespace creator can register paid names.
    /// - `(label, namespace)` must not be registered yet.
    /// - msg.sender must not already have a name.
    /// - Name is immutable once set.
    /// - ETH is burned via DETH contract, crediting msg.sender with DETH.
    function register(
        string calldata label
    ) external payable {
        _validateLabel(label);

        uint256 pricePerName = msg.value;
        require(pricePerName > 0, "XNS: zero price");

        string memory namespace_ = _priceToNamespace[pricePerName];
        require(bytes(namespace_).length != 0, "XNS: price not mapped to namespace");

        // Load namespace metadata (we trust it exists because of the price mapping invariant).
        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];

        // During exclusive period, only namespace creator can register paid names.
        if (block.timestamp < ns.createdAt + NS_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: namespace in exclusive period");
        }

        // Enforce one-name-per-address globally.
        require(
            bytes(_reverseName[msg.sender].label).length == 0,
            "XNS: address already has a name"
        );

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace_));
        require(_records[key] == address(0), "XNS: name already registered");

        _records[key] = msg.sender;
        _reverseName[msg.sender] = Name({label: label, namespace_: namespace_});

        emit NameRegistered(label, namespace_, msg.sender);

        _burn(msg.value, msg.sender);
    }

    /// @notice Creator-only free registration (can be used any time).
    /// @dev
    /// - `msg.sender` must be `namespace_.creator`.
    /// - Up to `MAX_FREE_NAMES_PER_NAMESPACE` total free names per namespace.
    /// - Can assign names to arbitrary owners, but each owner must not already have a name.
    /// - `msg.value` must be 0.
    function claimFreeNames(
        string calldata namespace_,
        Claim[] calldata claims
    ) external {
        require(msg.value == 0, "XNS: no ETH for free registration");

        uint256 count = claims.length;
        require(count > 0, "XNS: empty claims");

        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");
        require(msg.sender == ns.creator, "XNS: not namespace creator");
        require(
            count <= ns.remainingFreeNames,
            "XNS: free name quota exceeded"
        );

        for (uint256 i = 0; i < count; i++) {
            string memory label = claims[i].label;
            address owner = claims[i].owner;

            _validateLabel(label);
            require(
                bytes(_reverseName[owner].label).length == 0,
                "XNS: owner already has a name"
            );

            bytes32 key = keccak256(
                abi.encodePacked(label, ".", namespace_)
            );

            require(_records[key] == address(0), "XNS: name already registered");

            _records[key] = owner;
            _reverseName[owner] = Name({label: label, namespace_: namespace_});

            emit NameRegistered(label, namespace_, owner);
        }

        ns.remainingFreeNames -= uint16(count);
        // No ETH burned; this is the reward for creating the namespace.
    }

    // =========================================================================
    // GETTER / VIEW FUNCTIONS
    // =========================================================================

    /// @notice Get the address for a given (label, namespace).
    function getAddress(
        string calldata label,
        string calldata namespace_
    ) public view returns (address owner) {
        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace_));
        return _records[key];
    }

    /// @notice Get the address for a full name string like "nike", "nike.x", "vitalik.001".
    /// @dev
    /// - If `fullName` contains no dot, it's treated as `label=fullName`, `namespace="x"`.
    /// - If it contains a dot, split into `label.namespace`.
    function getAddress(
        string calldata fullName
    ) external view returns (address owner) {
        bytes memory b = bytes(fullName);
        require(b.length > 0, "XNS: empty name");

        // Find last dot (if any)
        int256 lastDot = -1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == 0x2E) { // '.'
                lastDot = int256(i);
            }
        }

        string memory label;
        string memory namespace_;

        if (lastDot == -1) {
            // No dot: bare name => use special namespace "x"
            label = fullName;
            namespace_ = SPECIAL_NAMESPACE;
        } else {
            // Split at last dot
            uint256 dotIndex = uint256(lastDot);
            require(dotIndex > 0 && dotIndex < b.length - 1, "XNS: invalid full name");

            bytes memory bl = new bytes(dotIndex);
            for (uint256 i = 0; i < dotIndex; i++) {
                bl[i] = b[i];
            }

            uint256 nsLen = b.length - dotIndex - 1;
            bytes memory bn = new bytes(nsLen);
            for (uint256 i = 0; i < nsLen; i++) {
                bn[i] = b[dotIndex + 1 + i];
            }

            label = string(bl);
            namespace_ = string(bn);
        }

        _validateLabel(label);
        _validateNamespace(namespace_);

        return getAddress(label, namespace_);
    }

    /// @notice Reverse lookup: get the XNS name (label, namespace) for an address.
    /// @dev Returns empty strings if the address has no name.
    function getName(
        address owner
    ) external view returns (string memory label, string memory namespace_) {
        Name storage n = _reverseName[owner];
        label = n.label;
        namespace_ = n.namespace_;
    }

    /// @notice Get the namespace string for a given price (in wei).
    /// @dev Returns empty string if price is not mapped.
    function getNamespace(
        uint256 price
    ) external view returns (string memory namespace_) {
        return _priceToNamespace[price];
    }

    /// @notice Get namespace metadata by namespace string.
    function getNamespaceInfo(
        string calldata namespace_
    )
        external
        view
        returns (
            uint256 pricePerName,
            address creator_,
            uint64 createdAt,
            uint16 remainingFreeNames
        )
    {
        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        return (ns.pricePerName, ns.creator, ns.createdAt, ns.remainingFreeNames);
    }

    /// @notice Get namespace metadata by price (and also return the namespace string).
    function getNamespaceInfo(
        uint256 price
    )
        external
        view
        returns (
            string memory namespace_,
            uint256 pricePerName,
            address creator_,
            uint64 createdAt,
            uint16 remainingFreeNames
        )
    {
        namespace_ = _priceToNamespace[price];
        require(bytes(namespace_).length != 0, "XNS: price not mapped to namespace");

        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        return (namespace_, ns.pricePerName, ns.creator, ns.createdAt, ns.remainingFreeNames);
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /// @dev Validate label:
    ///      - non-empty
    ///      - length 1–20
    ///      - consists only of [a-z0-9-]
    ///      - cannot start or end with '-'
    function _validateLabel(string memory label) internal pure {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        require(len > 0, "XNS: empty label");
        require(len <= 20, "XNS: label too long");

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];

            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A); // 'a'..'z'
            bool isDigit           = (c >= 0x30 && c <= 0x39); // '0'..'9'
            bool isHyphen          = (c == 0x2D);              // '-'

            require(
                isLowercaseLetter || isDigit || isHyphen,
                "XNS: invalid label char (allowed: a-z, 0-9, -)"
            );
        }

        // No leading or trailing hyphen.
        require(b[0] != 0x2D, "XNS: label cannot start with '-'");
        require(b[len - 1] != 0x2D, "XNS: label cannot end with '-'");
    }

    /// @dev Validate namespace:
    ///      - non-empty
    ///      - length 1–4
    ///      - consists only of [a-z0-9]
    function _validateNamespace(string memory namespace_) internal pure {
        bytes memory b = bytes(namespace_);
        uint256 len = b.length;
        require(len > 0, "XNS: empty namespace");
        require(len <= 4, "XNS: namespace too long");

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];

            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A); // 'a'..'z'
            bool isDigit           = (c >= 0x30 && c <= 0x39); // '0'..'9'

            require(
                isLowercaseLetter || isDigit,
                "XNS: invalid namespace char (allowed: a-z, 0-9)"
            );
        }
    }

    /// @dev Simple string equality (by keccak256).
    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    /// @dev Burn ETH via DETH contract, crediting the recipient with DETH.
    function _burn(uint256 amount, address recipient) internal {
        if (amount == 0) return;
        IDETH(DETH).burn{value: amount}(recipient);
    }

    // Disallow plain ETH transfers.
    receive() external payable {
        revert("XNS: direct ETH not allowed");
    }

    fallback() external payable {
        revert("XNS: fallback not allowed");
    }
}
