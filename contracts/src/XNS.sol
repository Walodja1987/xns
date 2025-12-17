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

/// @title XNS
/// @notice Ethereum-only name registry: ETH amount -> namespace, (label, namespace) -> address.
/// @dev
/// - Names are immutable and non-transferable.
/// - ETH amount per name determines the namespace via a price mapping (e.g., 0.001 ETH = "xns" namespace).
/// - Anyone can register new namespaces by paying a one-time fee
///   (except the contract creator, who pays no namespace fee in the first 90 days).
/// - Namespace creator gets a 1-month exclusive period for paid registrations.
/// - Namespace creator can assign up to 200 free names per namespace (at any time).
/// - Each address can own at most one XNS name globally.
/// - "eth" namespace is forbidden to avoid confusion with ENS.
/// - Bare labels (e.g. "nike") are treated as "nike.x" (the special namespace).
contract XNS {
    // -------------------------------------------------------------------------
    // Types
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
        string namespace;
    }

    // -------------------------------------------------------------------------
    // Storage (private, accessed via getters)
    // -------------------------------------------------------------------------

    /// @dev mapping from keccak256(label, ".", namespace) to owner address.
    mapping(bytes32 => address) private _records;

    /// @dev mapping from namespace hash to namespace metadata.
    mapping(bytes32 => NamespaceData) private _namespaces;

    /// @dev mapping from price-per-name (wei) to namespace string.
    mapping(uint256 => string) private _priceToNamespace;

    /// @dev reverse mapping: address -> (label, namespace).
    /// If label is empty, the address has no name.
    mapping(address => Name) private _reverseName;

    /// @dev mapping from address to pending fees (in wei) that can be claimed.
    mapping(address => uint256) private _pendingFees;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev contract owner address (immutable, set at deployment).
    address public immutable owner;

    /// @dev deployment timestamp.
    uint64 public immutable deployedAt;

    /// @dev flat fee to register a new namespace (in wei) for non-creator callers.
    uint256 public constant NAMESPACE_REGISTRATION_FEE = 200 ether;

    /// @dev maximum number of free names the creator can mint in their namespace.
    uint16 public constant MAX_FREE_NAMES_PER_NAMESPACE = 200;

    /// @dev duration of the exclusive namespace-creator window for paid registrations.
    uint256 public constant NS_CREATOR_EXCLUSIVE_PERIOD = 30 days;

    /// @dev period after contract deployment during which the owner pays no namespace registration fee.
    uint256 public constant INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD  = 90 days;

    /// @dev unit price step (0.001 ETH).
    uint256 public constant PRICE_STEP = 1e15; // 0.001 ether

    /// @dev special namespace used for bare labels (e.g. "nike" = "nike.x").
    string public constant SPECIAL_NAMESPACE = "x";

    /// @dev price-per-name for the special namespace (bare names).
    uint256 public constant SPECIAL_NAMESPACE_PRICE = 100 ether;

    /// @dev Address of DETH contract used to burn ETH and credit the recipient.
    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);

    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator);

    event FeesClaimed(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _owner) {
        owner = _owner;
        deployedAt = uint64(block.timestamp);

        // Register special namespace "x" as the very first namespace.
        // Note: namespace creator privileges are tied to the address set here, not the contract owner.
        // Contract ownership is immutable and cannot be transferred.
        bytes32 nsHash = keccak256(bytes(SPECIAL_NAMESPACE));
        _namespaces[nsHash] = NamespaceData({
            pricePerName: SPECIAL_NAMESPACE_PRICE,
            creator: _owner,
            createdAt: uint64(block.timestamp),
            remainingFreeNames: MAX_FREE_NAMES_PER_NAMESPACE
        });

        _priceToNamespace[SPECIAL_NAMESPACE_PRICE] = SPECIAL_NAMESPACE;

        emit NamespaceRegistered(SPECIAL_NAMESPACE, SPECIAL_NAMESPACE_PRICE, _owner);
    }

    // =========================================================================
    // STATE-MODIFYING FUNCTIONS
    // =========================================================================

    /// @notice Register a paid name for `msg.sender`. Namespace is determined by `msg.value`.
    /// @dev Following namespace registration, the namespace creator has a 30-day exclusivity window for registering paid names.
    /// A namespace creator would typically first claim free names via the `claimFreeNames` function
    /// before registering paid names.
    function registerName(string calldata label) external payable {
        require(_isValidLabel(label), "XNS: invalid label");

        uint256 pricePerName = msg.value;
        require(pricePerName > 0, "XNS: zero price");

        // Determine namespace from pricePerName.
        string memory namespace_ = _priceToNamespace[pricePerName];
        require(bytes(namespace_).length != 0, "XNS: non-existent namespace");

        // Load namespace metadata.
        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];

        // Following namespace registration, the namespace creator has a 30-day exclusivity window for registering paid names.
        // A namespace creator would typically first claim free names via the `claimFreeNames` function
        // before registering paid names.
        if (block.timestamp < ns.createdAt + NS_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: namespace in exclusive period");
        }

        // Enforce one-name-per-address globally.
        require(bytes(_reverseName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace_));
        require(_records[key] == address(0), "XNS: name already registered");

        _records[key] = msg.sender;
        _reverseName[msg.sender] = Name({label: label, namespace: namespace_});

        emit NameRegistered(label, namespace_, msg.sender);

        // Distribute fees: 90% burnt, 5% to namespace creator, 5% to contract owner.
        _burnETHAndCreditFees(msg.value, ns.creator);
    }

    /// @notice Register a new namespace and assign a price-per-name.
    /// @dev During initial owner namespace registration period (90 days following contract deployment), the owner pays no namespace registration fee.
    /// Anyone else can register a namespace for a fee, even within the initial owner namespace registration period.
    /// Note: The owner could theoretically front-run namespace registrations during this period, but doing so provides no economic benefit:
    /// the owner would only receive 5% of name registration fees (vs 200 ETH upfront fee), and users can mitigate this by
    /// waiting until after the 90-day period. This is an accepted design trade-off for simplicity.
    function registerNamespace(string calldata namespace_, uint256 pricePerName) external payable {
        require(_isValidNamespace(namespace_), "XNS: invalid namespace");

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(keccak256(bytes(namespace_)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");

        // Prevent the same price from being mapped to multiple namespaces.
        require(bytes(_priceToNamespace[pricePerName]).length == 0, "XNS: price already in use");

        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage existing = _namespaces[nsHash];
        require(existing.creator == address(0), "XNS: namespace already exists");

        if (block.timestamp < deployedAt + INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD && msg.sender == owner) {
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

        // Distribute fees: 90% burnt, 5% to namespace creator, 5% to contract owner.
        // `msg.value` = 0 within initial owner namespace registration period (90 days after contract deployment).
        if (msg.value > 0) {
            _burnETHAndCreditFees(msg.value, msg.sender);
        }
    }

    /// @notice Claim accumulated fees for msg.sender.
    /// @dev Withdraws all pending fees credited to the caller.
    function claimFees() external {
        uint256 amount = _pendingFees[msg.sender];
        require(amount > 0, "XNS: no fees to claim");

        _pendingFees[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "XNS: fee transfer failed");

        emit FeesClaimed(msg.sender, amount);
    }

    /// @notice Creator-only free registration (can be used any time).
    /// @dev
    /// - `msg.sender` must be `namespace.creator`.
    /// - Up to `MAX_FREE_NAMES_PER_NAMESPACE` total free names per namespace.
    /// - Can assign names to arbitrary owners, but each owner must not already have a name.
    function claimFreeNames(string calldata namespace, Claim[] calldata claims) external {
        uint256 count = claims.length;
        require(count > 0, "XNS: empty claims");

        bytes32 nsHash = keccak256(bytes(namespace));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");
        require(msg.sender == ns.creator, "XNS: not namespace creator");
        require(count <= ns.remainingFreeNames, "XNS: free name quota exceeded");

        for (uint256 i = 0; i < count; i++) {
            string memory label = claims[i].label;
            address _owner = claims[i].owner;

            require(_isValidLabel(label), "XNS: invalid label");
            require(_owner != address(0), "XNS: 0x owner");
            require(bytes(_reverseName[_owner].label).length == 0, "XNS: owner already has a name");

            bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
            require(_records[key] == address(0), "XNS: name already registered");

            _records[key] = _owner;
            _reverseName[_owner] = Name({label: label, namespace: namespace});

            emit NameRegistered(label, namespace, _owner);
        }

        ns.remainingFreeNames -= uint16(count);
    }

    // =========================================================================
    // GETTER / VIEW FUNCTIONS
    // =========================================================================

    /// @notice Canonical resolution: resolve (label, namespace) to an address.
    /// @dev
    /// - No parsing
    /// - No validation
    /// - Returns address(0) if not registered
    /// @return _address The address associated with the name, or address(0) if not registered.
    function getAddress(
        string calldata label,
        string calldata namespace
    ) external view returns (address _address) {
        return _getAddress(label, namespace);
    }

    /// @notice Human-friendly resolution: resolve a full name like "nike", "nike.x", "vitalik.001".
    /// @dev
    /// - Best-effort parsing
    /// - Bare names are treated as label.x
    /// - Returns address(0) for anything not registered or malformed
    /// @return _address The address associated with the name, or address(0) if not registered.
    function getAddress(string calldata fullName) external view returns (address _address) {
        bytes memory b = bytes(fullName);
        uint256 len = b.length;
        if (len == 0) return address(0);

        // Search for '.' from the right within the last 5 characters (".xxxx")
        uint256 endExclusive = (len > 5) ? (len - 5) : 0;
        int256 lastDot = -1;

        for (uint256 i = len - 1; i > endExclusive; i--) {
            if (b[i] == 0x2E) { // '.'
                lastDot = int256(i);
                break;
            }
        }

        string memory label;
        string memory namespace;

        if (lastDot == -1) {
            // Bare label => label.x
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


    /// @notice Reverse lookup: get the XNS name (label, namespace) for an address.
    /// @dev Returns empty strings if the address has no name.
    function getName(address _address) external view returns (string memory label, string memory namespace_) {
        Name storage n = _reverseName[_address];
        label = n.label;
        namespace_ = n.namespace;
    }

    /// @notice Get namespace metadata by namespace string.
    function getNamespaceInfo(
        string calldata namespace_
    )
        external
        view
        returns (uint256 pricePerName, address creator, uint64 createdAt, uint16 remainingFreeNames)
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
        returns (string memory namespace_, uint256 pricePerName, address creator_, uint64 createdAt, uint16 remainingFreeNames)
    {
        namespace_ = _priceToNamespace[price];
        require(bytes(namespace_).length != 0, "XNS: price not mapped to namespace");

        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        return (namespace_, ns.pricePerName, ns.creator, ns.createdAt, ns.remainingFreeNames);
    }

    /// @notice Check if a label is valid.
    function isValidLabel(string memory label) external pure returns (bool) {
        return _isValidLabel(label);
    }

    /// @notice Check if a namespace is valid.
    function isValidNamespace(string memory namespace_) external pure returns (bool) {
        return _isValidNamespace(namespace_);
    }

    /// @notice Get the amount of pending fees that can be claimed by an address.
    function pendingFees(address recipient) external view returns (uint256) {
        return _pendingFees[recipient];
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /// @dev Get address for a given label and namespace.
    /// @param label The label part of the name.
    /// @param namespace The namespace part of the name.
    /// @return _address The address associated with the name, or address(0) if not registered.
    function _getAddress(string memory label, string memory namespace) internal view returns (address _address) {
        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        return _records[key];
    }

    /// @dev Distribute fees: 90% burnt via DETH, 5% credited to namespace creator, 5% credited to contract owner.
    /// @param totalAmount The total amount to distribute.
    /// @param namespaceCreator The address of the namespace creator.
    function _burnETHAndCreditFees(uint256 totalAmount, address namespaceCreator) internal {
        uint256 burnAmount = totalAmount * 90 / 100;
        uint256 creatorFee = totalAmount * 5 / 100;
        uint256 ownerFee = totalAmount - burnAmount - creatorFee; // Ensures exact 100% distribution

        // Burn 90% via DETH contract and credit `msg.sender` with DETH.
        IDETH(DETH).burn{value: burnAmount}(msg.sender);

        // Credit fees to recipients.
        _pendingFees[namespaceCreator] += creatorFee;
        _pendingFees[owner] += ownerFee;
    }

    /// @dev Check if a label is valid (returns bool, does not revert).
    ///      - non-empty
    ///      - length 1–20
    ///      - consists only of [a-z0-9-]
    ///      - cannot start or end with '-'
    function _isValidLabel(string memory label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len == 0 || len > 20) return false;

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A); // 'a'..'z'
            bool isDigit = (c >= 0x30 && c <= 0x39); // '0'..'9'
            bool isHyphen = (c == 0x2D); // '-'
            if (!(isLowercaseLetter || isDigit || isHyphen)) return false;
        }

        if (b[0] == 0x2D || b[len - 1] == 0x2D) return false; // no leading/trailing '-'
        return true;
    }

    /// @dev Check if a namespace is valid (returns bool, does not revert).
    ///      - non-empty
    ///      - length 1–4
    ///      - consists only of [a-z0-9]
    function _isValidNamespace(string memory namespace_) internal pure returns (bool) {
        bytes memory b = bytes(namespace_);
        uint256 len = b.length;
        if (len == 0 || len > 4) return false;

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A); // 'a'..'z'
            bool isDigit = (c >= 0x30 && c <= 0x39); // '0'..'9'
            if (!(isLowercaseLetter || isDigit)) return false;
        }

        return true;
    }
}
