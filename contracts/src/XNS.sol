// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IDETH} from "./interfaces/IDETH.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

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
/// Examples:
/// - alice.xns
/// - bob.yolo
/// - vitalik.100x
/// - garry.ape
///
/// ### Name registration
/// - To register a name, users call `registerName(label, namespace)` and send ETH.
/// - The amount of ETH sent must be >= the namespace's registered price (excess will be refunded).
/// - For example, if the "100x" namespace was registered with price 0.1 ETH, then calling
///   `registerName("vitalik", "100x")` with 0.1 ETH registers "vitalik.100x".
/// - Each address can own at most one name.
/// - With `registerName(label, namespace)`, names are always linked to the caller's address and cannot
///   be assigned to another address.
///
/// ### Sponsorship via authorization (EIP-712 + EIP-1271)
/// - `registerNameWithAuthorization` allows a sponsor (`msg.sender`) to pay and register a name for a recipient
///   who explicitly authorized it via signature.
/// - During the namespace creator exclusivity window, only the namespace creator may sponsor registrations
///   in that namespace (public `registerName` is disabled for non-creators).
/// - Recipients sign an EIP-712 message authorizing the specific name registration, providing opt-in consent.
/// - Supports both EOA signatures and EIP-1271 contract wallet signatures (Safe, Argent, etc.).
///
/// ### Bare names
/// - A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
/// - Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x"
///   or "bankless" = "bankless.x".
/// - Bare names are considered premium names and cost 100 ETH per name.
///
/// ### Namespace registration
/// - Anyone can register new namespaces by paying a one-time fee of 200 ETH.
/// - Namespace creators receive a 30-day exclusive window for registering paid names within the registered namespace.
///   During this period, only the creator can use `registerName` for themselves or sponsor registrations via
///   `registerNameWithAuthorization` for others.
/// - The XNS contract owner can register namespaces for free in the first year following contract deployment.
/// - The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
/// - "eth" namespace is disallowed to avoid confusion with ENS.
///
/// ### Ethereum-native economics
/// - 90% of ETH sent during name / namespace registration is burnt via the DETH contract,
///   supporting Ethereum's deflationary mechanism and ETH's value accrual.
/// - 10% is credited as fees to the namespace creator and the XNS contract owner (5% each).
contract XNS is EIP712 {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @dev Data structure to store namespace metadata.
    struct NamespaceData {
        uint256 pricePerName;
        address creator;
        uint64 createdAt;
    }

    /// @dev Data structure to store a name (label, namespace) associated with an address.
    struct Name {
        string label;
        string namespace;
    }

    /// @dev Argument for `registerNameWithAuthorization` function (EIP-712 based).
    struct RegisterNameAuth {
        address recipient; // Name recipient and signer of the EIP-712 message
        string label;
        string namespace;
    }

    // -------------------------------------------------------------------------
    // Storage (private, accessed via getters)
    // -------------------------------------------------------------------------

    // Mapping from address to name (label, namespace). If label is empty, the address has no name.
    mapping(address => Name) private _addressToName;

    // Mapping from keccak256(label, ".", namespace) to name owner address.
    mapping(bytes32 => address) private _nameHashToAddress;

    // Mapping from keccak256(namespace) to namespace metadata.
    mapping(bytes32 => NamespaceData) private _namespaces;

    // Mapping from price-per-name to namespace string.
    mapping(uint256 => string) private _priceToNamespace;

    // Mapping from address to pending fees that can be claimed.
    mapping(address => uint256) private _pendingFees;

    // EIP-712 struct type hash for RegisterNameAuth:
    //
    // keccak256(
    //     abi.encodePacked(
    //         "RegisterNameAuth(",
    //         "address recipient,",
    //         "bytes32 labelHash,",
    //         "bytes32 namespaceHash)"
    //     )
    // )
    bytes32 private constant _REGISTER_NAME_AUTH_TYPEHASH =
        0xfed68b8c50be9d8c7775136bcef61eefc74849472c4e4e5c861277fbcbdcebd7;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice XNS contract owner address (immutable, set at deployment).
    address public immutable OWNER;

    /// @notice XNS contract deployment timestamp.
    uint64 public immutable DEPLOYED_AT;

    /// @notice Fee to register a new namespace.
    uint256 public constant NAMESPACE_REGISTRATION_FEE = 200 ether;

    /// @notice Duration of the exclusive namespace-creator window for paid registrations.
    uint256 public constant NAMESPACE_CREATOR_EXCLUSIVE_PERIOD = 30 days;

    /// @notice Period after contract deployment during which the owner pays no namespace registration fee.
    uint256 public constant INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD = 365 days;

    /// @notice Unit price step (0.001 ETH).
    uint256 public constant PRICE_STEP = 1e15; // 0.001 ether

    /// @notice Special namespace used for bare labels (e.g. "nike" = "nike.x").
    string public constant SPECIAL_NAMESPACE = "x";

    /// @notice Price-per-name for the special namespace (bare names).
    uint256 public constant SPECIAL_NAMESPACE_PRICE = 100 ether;

    /// @notice Address of DETH contract used to burn ETH and credit the recipient.
    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @dev Emitted in `registerName`, `registerNameWithAuthorization`,
    /// and `batchRegisterNameWithAuthorization` functions.
    event NameRegistered(string indexed label, string indexed namespace, address indexed owner); // @todo rename to nameOwner? Also in tests and IXNS?

    /// @dev Emitted in constructor when "x" namespace is registered, and in `registerNamespace` function.
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator);

    /// @dev Emitted in `claimFees` and `claimFeesToSelf` functions.
    event FeesClaimed(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @dev Initializes the contract by setting the immutable owner and deployment timestamp.
    /// Also pre-registers the special namespace "x" (bare names) with the given owner as its creator
    /// and a price of 100 ETH per name.
    /// @param owner Address that will own the contract and receive protocol fees.
    constructor(address owner) EIP712("XNS", "1") {
        OWNER = owner;
        DEPLOYED_AT = uint64(block.timestamp);

        // Register special namespace "x" as the very first namespace.
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

    /// @notice Function to register a paid name for `msg.sender`.
    /// Namespace creators have a 30-day exclusivity window to register a name for themselves
    /// within their registered namespace, following namespace registration. Registrations are
    /// opened to the public after the 30-day exclusivity period.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-', cannot contain consecutive hyphens)
    /// - Namespace must be valid and exist.
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - Caller must be namespace creator if called during the 30-day exclusivity period.
    /// - Caller must not already have a name.
    /// - Name must not already be registered.
    ///
    /// @param label The label part of the name to register.
    /// @param namespace The namespace part of the name to register.
    function registerName(string calldata label, string calldata namespace) external payable {
        require(_isValidLabel(label), "XNS: invalid label");

        // Verify namespace exists.
        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");

        // Verify `msg.value` is sufficient (excess will be refunded).
        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        // Following namespace registration, the namespace creator has a 30-day exclusivity window for registering
        // one paid name for themselves within the registered namespace. Can register more names on behalf
        // of others using the `registerNameWithAuthorization` / `batchRegisterNameWithAuthorization` function.
        if (block.timestamp < ns.createdAt + NAMESPACE_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator");
        }

        // Enforce one-name-per-address globally.
        require(bytes(_addressToName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        _nameHashToAddress[key] = msg.sender;
        _addressToName[msg.sender] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, msg.sender);

        // Process payment: burn 90%, credit fees, and refund excess.
        _processETHPayment(ns.pricePerName, ns.creator);
    }

    /// @notice Function to sponsor a paid name registration for `recipient` who explicitly authorized it via
    /// signature. Allows a third party (relayer) to pay gas and registration fees while the recipient explicitly
    /// approves via EIP-712 signature. During the namespace creator exclusivity period, only the namespace creator
    /// may sponsor registrations in that namespace.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-')
    /// - `recipient` must not be the zero address.
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - Namespace must exist.
    /// - During exclusivity: only namespace creator can call this function.
    /// - Recipient must not already have a name.
    /// - Name must not already be registered.
    /// - Signature must be valid EIP-712 signature from `recipient`.
    ///
    /// @param registerNameAuth The argument for the function, including label, namespace, and recipient.
    /// @param signature EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature.
    function registerNameWithAuthorization(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) external payable {
        require(_isValidLabel(registerNameAuth.label), "XNS: invalid label");
        require(registerNameAuth.recipient != address(0), "XNS: 0x recipient");

        // Verify namespace exists.
        bytes32 nsHash = keccak256(bytes(registerNameAuth.namespace));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        // Verify `msg.value` is sufficient (excess will be refunded).
        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        // During exclusivity, only namespace creator may sponsor registrations.
        if (block.timestamp < ns.createdAt + NAMESPACE_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator");
        }

        // Enforce one-name-per-address globally.
        require(
            bytes(_addressToName[registerNameAuth.recipient].label).length == 0,
            "XNS: recipient already has a name"
        );

        bytes32 key = keccak256(abi.encodePacked(registerNameAuth.label, ".", registerNameAuth.namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        // Verify that the signature is valid.
        require(_isValidSignature(registerNameAuth, signature), "XNS: bad authorization");

        // Register name to recipient (not msg.sender).
        _nameHashToAddress[key] = registerNameAuth.recipient;
        _addressToName[registerNameAuth.recipient] = Name({
            label: registerNameAuth.label,
            namespace: registerNameAuth.namespace
        });

        emit NameRegistered(registerNameAuth.label, registerNameAuth.namespace, registerNameAuth.recipient);

        // Process payment: burn 90%, credit fees, and refund excess.
        _processETHPayment(ns.pricePerName, ns.creator);
    }

    /// @notice Batch version of `registerNameWithAuthorization` to register multiple names with a single transaction.
    /// All registrations must be in the same namespace. Skips registrations where the recipient already has a name
    /// or the name is already registered. Skipped items are not charged; excess payment is refunded.
    ///
    /// **Requirements:**
    /// - All registrations must be in the same namespace.
    /// - Array arguments must have equal length and be non-empty.
    /// - `msg.value` must be >= `pricePerName * successfulCount` (excess will be refunded).
    /// - All individual requirements from `registerNameWithAuthorization` apply to each registration.
    ///
    /// @dev **Note:** Input validation errors (invalid label, zero recipient, namespace mismatch, invalid signature)
    /// cause the entire batch to revert. Errors that could occur due to front-running the batch tx (recipient already
    /// has a name, or name already registered) are skipped to provide griefing protection.
    ///
    /// @param registerNameAuths Array of `RegisterNameAuth` structs, each including label, namespace, and recipient.
    /// @param signatures Array of EIP-712 signatures by recipients (EOA) or EIP-1271 contract signatures.
    /// @return successfulCount The number of names successfully registered (may be 0 if all registrations were skipped).
    function batchRegisterNameWithAuthorization(
        RegisterNameAuth[] calldata registerNameAuths,
        bytes[] calldata signatures
    ) external payable returns (uint256 successfulCount) {
        require(registerNameAuths.length == signatures.length, "XNS: length mismatch");
        require(registerNameAuths.length > 0, "XNS: empty array");

        // Cache the namespace of the first registration (used to verify that all
        // other items reference the same namespace).
        bytes32 firstNsHash = keccak256(bytes(registerNameAuths[0].namespace));
        NamespaceData storage ns = _namespaces[firstNsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        // Check whether within exclusivity period.
        if (block.timestamp < ns.createdAt + NAMESPACE_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator");
        }

        // Validate and register all names, skipping where the recipient already has a name
       // or the name is already registered.
        uint256 successful = 0;
        for (uint256 i = 0; i < registerNameAuths.length; i++) {
            RegisterNameAuth calldata auth = registerNameAuths[i];

            // Validations that should revert (invalid input).
            require(_isValidLabel(auth.label), "XNS: invalid label");
            require(auth.recipient != address(0), "XNS: 0x recipient");

            // Skip if recipient already has a name (resistant to griefing attacks).
            // Check early to avoid expensive operations below.
            if (bytes(_addressToName[auth.recipient].label).length > 0) {
                continue;
            }

            // Verify all are same namespace.
            bytes32 nsHash = keccak256(bytes(auth.namespace));
            require(nsHash == firstNsHash, "XNS: namespace mismatch");

            bytes32 key = keccak256(abi.encodePacked(auth.label, ".", auth.namespace));
            
            // Skip if name is already registered (resistant to griefing attacks).
            // Check early to avoid expensive signature validation below.
            if (_nameHashToAddress[key] != address(0)) {
                continue;
            }

            // Verify that the signature is valid.
            // Doing this expensive check only if we're not skipping.
            require(_isValidSignature(auth, signatures[i]), "XNS: bad authorization");

            // Register name to recipient (not msg.sender).
            _nameHashToAddress[key] = auth.recipient;
            _addressToName[auth.recipient] = Name({
                label: auth.label,
                namespace: auth.namespace
            });

            emit NameRegistered(auth.label, auth.namespace, auth.recipient);
            successful++;
        }

        // Process payment only for successful registrations: burn 90%, credit fees, and refund excess.
        if (successful > 0) {
            uint256 actualTotal = ns.pricePerName * successful;
            require(msg.value >= actualTotal, "XNS: insufficient payment");
            _processETHPayment(actualTotal, ns.creator);
            return successful;
        }

        // If no registrations succeeded, refund all payment and return 0.
        if (msg.value > 0) {
            (bool success, ) = msg.sender.call{value: msg.value}("");
            require(success, "XNS: refund failed");
        }
        return 0;
    }

    /// @notice Function to register a new namespace and assign a price-per-name.
    ///
    /// **Requirements:**
    /// - Namespace must be valid (non-empty, length 1–4, consists only of [a-z0-9])
    /// - `msg.value` must be >= 200 ETH (excess will be refunded). Owner pays 0 ETH during initial period.
    /// - Price per name must be a multiple of 0.001 ETH.
    /// - Price per name must not already be in use.
    /// - Namespace must not equal "eth".
    ///
    /// **Note:**
    /// - During the initial owner namespace registration period (1 year following contract deployment),
    ///   the owner pays no namespace registration fee.
    /// - Anyone can register a namespace for a 200 ETH fee, even within the initial owner
    ///   namespace registration period.
    /// - Front-running namespace registrations by the owner during the initial owner namespace
    ///   registration period provides no economic benefit: the owner would only receive 5% of name
    ///   registration fees (vs 200 ETH upfront fee), and users can mitigate this by waiting until
    ///   after the 1-year period. This is an accepted design trade-off for simplicity.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name to assign to the namespace.
    function registerNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(_isValidNamespace(namespace), "XNS: invalid namespace");

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(keccak256(bytes(namespace)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");

        // Prevent the same price from being mapped to multiple namespaces.
        require(bytes(_priceToNamespace[pricePerName]).length == 0, "XNS: price already in use");

        bytes32 nsHash = keccak256(bytes(namespace));
        NamespaceData storage existing = _namespaces[nsHash];
        require(existing.creator == address(0), "XNS: namespace already exists");

        // Determine required payment amount.
        uint256 requiredAmount = 0;
        if (!(block.timestamp < DEPLOYED_AT + INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD && msg.sender == OWNER)) {
            requiredAmount = NAMESPACE_REGISTRATION_FEE;
            require(msg.value >= requiredAmount, "XNS: insufficient namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp)
        });

        _priceToNamespace[pricePerName] = namespace;

        emit NamespaceRegistered(namespace, pricePerName, msg.sender);

        // Process payment: burn 90%, credit fees, and refund excess (if any).
        // `requiredAmount` = 0 within initial owner namespace registration period (1 year after contract deployment).
        if (requiredAmount > 0) {
            _processETHPayment(requiredAmount, msg.sender);
        } else if (msg.value > 0) {
            // Refund if owner sent ETH during free period.
            (bool success, ) = msg.sender.call{value: msg.value}("");
            require(success, "XNS: refund failed");
        }
    }

    /// @notice Function to claim accumulated fees for `msg.sender` and send to `recipient`.
    /// Withdraws all pending fees. Partial claims are not possible.
    ///
    /// **Requirements:**
    /// - `recipient` must not be the zero address.
    /// - `msg.sender` must have pending fees to claim.
    ///
    /// @param recipient The address that will receive the claimed fees.
    function claimFees(address recipient) external {
        require(recipient != address(0), "XNS: zero recipient");
        _claimFees(recipient);
    }

    /// @notice Function to claim accumulated fees for `msg.sender` and send to `msg.sender`.
    /// Withdraws all pending fees. Partial claims are not possible.
    ///
    /// **Requirements:**
    /// - `msg.sender` must have pending fees to claim.
    function claimFeesToSelf() external {
        _claimFees(msg.sender);
    }

    /// @dev Helper function for `claimFees` and `claimFeesToSelf`.
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

    /// @notice Function to resolve a name string like "nike", "nike.x", "vitalik.001" to an address.
    ///
    /// **Requirements:**
    /// - `fullName` must not be empty.
    /// - `fullName` must be a valid name string (label.namespace).
    ///
    /// @dev Returns `address(0)` for anything not registered or malformed.
    /// @param fullName The name string to resolve.
    /// @return addr The address associated with the name, or `address(0)` if not registered.
    function getAddress(string calldata fullName) external view returns (address addr) {
        bytes memory b = bytes(fullName);
        uint256 len = b.length;
        if (len == 0) return address(0);

        // Search for '.' from the right within the last 5 characters (".xxxx")
        uint256 endExclusive = (len > 5) ? (len - 5) : 0;
        int256 lastDot = -1;

        for (uint256 i = len - 1; ; i--) {
            if (i < endExclusive) break;
            if (b[i] == 0x2E) {
                // '.'
                lastDot = int256(i);
                break;
            }
            if (i == endExclusive) break;
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

    /// @notice Function to resolve a name to an address taking separate label and namespace parameters.
    /// @dev This version is more gas efficient than `getAddress(string calldata fullName)` as it does not
    /// require string splitting. Returns `address(0)` if not registered.
    /// @param label The label part of the name.
    /// @param namespace The namespace part of the name.
    /// @return addr The address associated with the name, or `address(0)` if not registered.
    function getAddress(string calldata label, string calldata namespace) external view returns (address addr) {
        return _getAddress(label, namespace);
    }

    /// @dev Helper function for `getAddress(fullName)` and `getAddress(label, namespace)`.
    function _getAddress(string memory label, string memory namespace) private view returns (address addr) {
        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));

        return _nameHashToAddress[key];
    }

    /// @notice Function to lookup the XNS name for an address.
    /// @dev Returns an empty string if the address has no name. For bare names (namespace "x"),
    /// returns just the label without the ".x" suffix. For regular names, returns the full name
    /// in format "label.namespace".
    /// @param addr The address to lookup the XNS name for.
    /// @return name The XNS name for the address, or empty string if the address has no name.
    function getName(address addr) external view returns (string memory) {
        Name storage n = _addressToName[addr];

        if (bytes(n.label).length == 0) {
            return "";
        }

        if (keccak256(bytes(n.namespace)) == keccak256(bytes(SPECIAL_NAMESPACE))) {
            // Bare name: return just the label without ".x"
            return n.label;
        }

        // Regular name: return "label.namespace"
        return string.concat(n.label, ".", n.namespace);
    }

    /// @notice Function to retrieve the namespace metadata associated with `namespace`.
    /// @param namespace The namespace to retrieve the metadata for.
    /// @return pricePerName The price per name for the namespace.
    /// @return creator The creator of the namespace.
    /// @return createdAt The timestamp when the namespace was created.
    function getNamespaceInfo(
        string calldata namespace
    ) external view returns (uint256 pricePerName, address creator, uint64 createdAt) {
        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");

        return (ns.pricePerName, ns.creator, ns.createdAt);
    }

    /// @notice Function to retrieve the namespace metadata associated with `price`.
    /// @param price The price to retrieve the namespace metadata for.
    /// @return namespace The namespace string.
    /// @return pricePerName The price per name for the namespace.
    /// @return creator The creator of the namespace.
    /// @return createdAt The timestamp when the namespace was created.
    function getNamespaceInfo(
        uint256 price
    ) external view returns (string memory namespace, uint256 pricePerName, address creator, uint64 createdAt) {
        namespace = _priceToNamespace[price];
        require(bytes(namespace).length != 0, "XNS: price not mapped to namespace");

        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");

        return (namespace, ns.pricePerName, ns.creator, ns.createdAt);
    }

    /// @notice Function to check if a label is valid (returns bool, does not revert).
    ///
    /// **Requirements:**
    /// - Label must be 1–20 characters long
    /// - Label must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
    /// - Label cannot start or end with '-'
    /// - Label cannot contain consecutive hyphens ('--')
    /// @param label The label to check if is valid.
    /// @return isValid True if the label is valid, false otherwise.
    function isValidLabel(string memory label) external pure returns (bool isValid) {
        return _isValidLabel(label);
    }

    /// @notice Function to check if a namespace is valid (returns bool, does not revert).
    ///
    /// **Requirements:**
    /// - Namespace must be 1–4 characters long
    /// - Namespace must consist only of [a-z0-9] (lowercase letters and digits)
    /// @param namespace The namespace to check if is valid.
    /// @return isValid True if the namespace is valid, false otherwise.
    function isValidNamespace(string memory namespace) external pure returns (bool isValid) {
        return _isValidNamespace(namespace);
    }

    /// @notice Function to check if a signature, to be used in `registerNameWithAuthorization`
    /// or `batchRegisterNameWithAuthorization`, is valid.
    /// @param registerNameAuth The struct containing recipient, label, and namespace.
    /// @param signature The signature to check.
    /// @return isValid True if the signature is valid, false otherwise.
    function isValidSignature(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) external view returns (bool isValid) {
        return _isValidSignature(registerNameAuth, signature);
    }

    /// @notice Function to retrieve the amount of pending fees that can be claimed by an address.
    /// @param recipient The address to retrieve the pending fees for.
    /// @return amount The amount of pending fees that can be claimed by the address.
    function getPendingFees(address recipient) external view returns (uint256 amount) {
        return _pendingFees[recipient];
    }

    // =========================================================================
    // INTERNAL MULTI-USE HELPER FUNCTIONS
    // =========================================================================

    /// @dev Helper function to process ETH payment: burn 90% via DETH, credit 5% to namespace creator and 5% to
    /// contract owner, and refund any excess payment. Used in `registerName`, `registerNameWithAuthorization`,
    /// `batchRegisterNameWithAuthorization`, and `registerNamespace`.
    /// @param requiredAmount The required amount of ETH for the operation (excess will be refunded).
    /// @param namespaceCreator The address of the namespace creator that shall receive a portion of the fees.
    function _processETHPayment(uint256 requiredAmount, address namespaceCreator) private {
        uint256 burnAmount = (requiredAmount * 90) / 100;
        uint256 creatorFee = (requiredAmount * 5) / 100;
        uint256 ownerFee = requiredAmount - burnAmount - creatorFee;

        // Burn 90% via DETH contract and credit `msg.sender` (payer/sponsor) with DETH.
        IDETH(DETH).burn{value: burnAmount}(msg.sender);

        // Credit fees to namespace creator and contract owner.
        _pendingFees[namespaceCreator] += creatorFee;
        _pendingFees[OWNER] += ownerFee;

        // Refund excess payment.
        uint256 excess = msg.value - requiredAmount;
        if (excess > 0) {
            (bool success, ) = msg.sender.call{value: excess}("");
            require(success, "XNS: refund failed");
        }
    }

    /// @dev Helper function to check if a label is valid. Used in `registerName` and `isValidLabel`.
    function _isValidLabel(string memory label) private pure returns (bool isValid) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len == 0 || len > 20) return false;
    
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLowercaseLetter = (c >= 0x61 && c <= 0x7A); // 'a'..'z'
            bool isDigit = (c >= 0x30 && c <= 0x39); // '0'..'9'
            bool isHyphen = (c == 0x2D); // '-'
            if (!(isLowercaseLetter || isDigit || isHyphen)) return false;
            
            // Disallow consecutive hyphens
            if (isHyphen && i > 0 && b[i - 1] == 0x2D) return false;
        }

        if (b[0] == 0x2D || b[len - 1] == 0x2D) return false; // no leading/trailing '-'

        return true;
    }

    /// @dev Helper function to check if a namespace is valid. Used in `registerNamespace` and `isValidNamespace`.
    function _isValidNamespace(string memory namespace) private pure returns (bool isValid) {
        bytes memory b = bytes(namespace);
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

    /// @dev Internal function to verify EIP-712 signature for RegisterNameAuth.
    /// Used in `registerNameWithAuthorization` and `batchRegisterNameWithAuthorization`.
    /// @param registerNameAuth The struct containing recipient, label, and namespace.
    /// @param signature The signature to verify.
    /// @return isValid True if the signature is valid, false otherwise.
    function _isValidSignature(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) private view returns (bool isValid) {
        // Compute EIP-712 digest.
        bytes32 digest = _hashTypedDataV4(_getRegisterNameAuthHash(registerNameAuth));

        // Verify signature using OpenZeppelin's SignatureChecker (supports EOA and EIP-1271).
        return SignatureChecker.isValidSignatureNow(registerNameAuth.recipient, digest, signature);
    }

    /// @dev Helper function to return hash of registerNameAuth details. Used in `_isValidSignature`.
    function _getRegisterNameAuthHash(
        RegisterNameAuth memory registerNameAuth
    ) private pure returns (bytes32 registerNameAuthHash) {
        registerNameAuthHash = keccak256(
            abi.encode(
                _REGISTER_NAME_AUTH_TYPEHASH,
                registerNameAuth.recipient,
                keccak256(bytes(registerNameAuth.label)),
                keccak256(bytes(registerNameAuth.namespace))
            )
        );
    }
}
