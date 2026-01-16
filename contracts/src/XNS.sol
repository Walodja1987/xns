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
/// Label and namespace string requirements:
/// - Must be 1–20 characters long
/// - Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
/// - Cannot start or end with '-'
/// - Cannot contain consecutive hyphens ('--')
/// - "eth" as namespace is disallowed to avoid confusion with ENS
///
/// ### Name registration with public namespaces
/// - Users call `registerName(label, namespace)` and send ETH.
/// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
/// - Each address can own at most one name.
///
/// ### Sponsorship via authorization (EIP-712 + EIP-1271)
/// - `registerNameWithAuthorization` allows a sponsor to pay and register a name for a recipient
///   who explicitly authorized it via an EIP-712 signature.
/// - Public namespaces: during the creator's 30-day exclusivity window, only the creator may sponsor.
/// - Private namespaces: only the creator may sponsor forever. Public registrations are disabled.
/// - Supports both EOA signatures and EIP-1271 contract wallet signatures.
///
/// ### Bare names
/// - A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
/// - Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x"
///   or "bankless" = "bankless.x". That is, both "vitalik" and "vitalik.x" resolve to the same address.
/// - Bare names are considered premium names and cost 10 ETH per name.
///
/// ### Namespace registration
/// - Anyone can register new namespaces by paying a one-time fee.
/// - Namespaces can be public or private. Public namespaces are open to the public for registrations,
///   while private namespaces are only open to the namespace creator and their authorized recipients.
/// - **Public namespaces:**
///   - Fee: 50 ETH
///   - Namespace creators receive a 30-day exclusive window for registering paid names within the registered namespace.
///   - During this period, the creator can use `registerName` to register a name for themselves and sponsor registrations via
///     `registerNameWithAuthorization` for others.
///   - After the exclusivity period, the namespace is opened to the public for registrations.
/// - **Private namespaces:**
///   - Fee: 10 ETH
///   - Only the namespace creator may register names within their private namespace forever.
/// - The XNS contract owner can register namespaces for free in the first year following contract deployment.
/// - The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
/// - "eth" namespace is disallowed for both public and private namespaces to avoid confusion with ENS.
///
/// ### Economics
/// - 90% of ETH sent is burnt via DETH.
/// - 10% is credited as fees.
///   - Public namespaces: 5% to namespace creator + 5% to XNS owner
///   - Private namespaces: 10% to XNS owner
contract XNS is EIP712 {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @dev Data structure to store namespace metadata.
    struct NamespaceData {
        uint256 pricePerName;
        address creator;
        uint64 createdAt;
        bool isPrivate;
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

    // Mapping from address to pending fees that can be claimed.
    mapping(address => uint256) private _pendingFees;

    // EIP-712 struct type hash for RegisterNameAuth:
    //
    // keccak256(
    //     abi.encodePacked(
    //         "RegisterNameAuth(",
    //         "address recipient,",
    //         "string label,",
    //         "string namespace)"
    //     )
    // )
    bytes32 private constant _REGISTER_NAME_AUTH_TYPEHASH =
        0x3af1a3ccc0c04cc5d0dde28c2900c21fbae8e30149f4caf140b9223938975f04;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice XNS contract owner address (immutable, set at deployment).
    address public immutable OWNER;

    /// @notice XNS contract deployment timestamp.
    uint64 public immutable DEPLOYED_AT;

    /// @notice Fee to register a public namespace.
    uint256 public constant PUBLIC_NAMESPACE_REGISTRATION_FEE = 50 ether;

    /// @notice Fee to register a private namespace.
    uint256 public constant PRIVATE_NAMESPACE_REGISTRATION_FEE = 10 ether;

    /// @notice Duration of the exclusive namespace-creator window for paid registrations
    /// (relevant for public namespace registrations only).
    uint256 public constant EXCLUSIVITY_PERIOD = 30 days;

    /// @notice Period after contract deployment during which the owner pays no namespace registration fee.
    uint256 public constant ONBOARDING_PERIOD = 365 days;

    /// @notice Unit price step (0.001 ETH).
    uint256 public constant PRICE_STEP = 0.001 ether;

    /// @notice Namespace associated with bare names (e.g. "vitalik" = "vitalik.x").
    string public constant BARE_NAME_NAMESPACE = "x";

    /// @notice Address of DETH contract used to burn ETH and credit the recipient.
    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @dev Emitted in `registerName`, `registerNameWithAuthorization`,
    /// and `batchRegisterNameWithAuthorization` functions.
    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);

    /// @dev Emitted in constructor when "x" namespace is registered, and in namespace registration functions.
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator, bool isPrivate);

    /// @dev Emitted in `claimFees` and `claimFeesToSelf` functions.
    event FeesClaimed(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @dev Initializes the contract by setting the immutable owner and deployment timestamp.
    /// Also pre-registers the special public namespace "x" (bare names) with the given owner as its creator
    /// and a price of 10 ETH per name. Additionally, registers the bare name "xns" for the XNS contract itself.
    /// @param owner Address that will own the contract and receive protocol fees.
    constructor(address owner) EIP712("XNS", "1") {
        require(owner != address(0), "XNS: 0x owner");

        OWNER = owner;
        DEPLOYED_AT = uint64(block.timestamp);

        // Register special public namespace "x" as the very first namespace.
        uint256 specialNamespacePrice = 10 ether;
        _namespaces[keccak256(bytes(BARE_NAME_NAMESPACE))] = NamespaceData({
            pricePerName: specialNamespacePrice,
            creator: owner,
            createdAt: uint64(block.timestamp),
            isPrivate: false
        });

        emit NamespaceRegistered(BARE_NAME_NAMESPACE, specialNamespacePrice, owner, false);

        // Register bare name "xns" for the XNS contract itself.
        string memory contractLabel = "xns";
        bytes32 nameKey = keccak256(abi.encodePacked(contractLabel, ".", BARE_NAME_NAMESPACE));
        _nameHashToAddress[nameKey] = address(this);
        _addressToName[address(this)] = Name({
            label: contractLabel,
            namespace: BARE_NAME_NAMESPACE
        });

        emit NameRegistered(contractLabel, BARE_NAME_NAMESPACE, address(this));
    }

    // =========================================================================
    // STATE-MODIFYING FUNCTIONS
    // =========================================================================

    /// @notice Function to register a paid name for `msg.sender` in a public namespace. To register a bare name
    /// (e.g., "vitalik"), use "x" as the namespace parameter. Namespace creators have a 30-day exclusivity window
    /// to register a name for themselves within their public namespace. Registrations are opened to the public after the 30-day
    /// exclusivity period.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-',
    ///   cannot contain consecutive hyphens)
    /// - Namespace must exist and must be a public namespace.
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - Caller must be namespace creator if called during the 30-day exclusivity period.
    /// - Caller must not already have a name.
    /// - Name must not already be registered.
    /// 
    /// **Note:** Due to block reorganization risks, users should wait for a few blocks and verify
    /// the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.
    ///
    /// @param label The label part of the name to register.
    /// @param namespace The namespace part of the name to register.
    function registerName(string calldata label, string calldata namespace) external payable {
        require(_isValidSlug(label), "XNS: invalid label");

        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        require(!ns.isPrivate, "XNS: private namespace");

        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        if (block.timestamp < ns.createdAt + EXCLUSIVITY_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (exclusivity period)");
        }

        require(bytes(_addressToName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        _nameHashToAddress[key] = msg.sender;
        _addressToName[msg.sender] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, msg.sender);

        // Process payment: burn 90%, credit fees, and refund excess.
        _processETHPayment(ns.pricePerName, ns.creator, false);
    }

    /// @notice Function to sponsor a paid name registration for `recipient` who explicitly authorized it via
    /// signature. Allows a third party to pay gas and registration fees while the recipient explicitly approves
    /// via EIP-712 signature. 
    /// For public namespaces, only namespace creator may sponsor registrations during exclusivity period. 
    /// For private namespaces, only namespace creator may sponsor registrations forever.
    /// Supports both EOA signatures and EIP-1271 contract wallet signatures.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-').
    /// - `recipient` must not be the zero address.
    /// - Namespace must exist (public or private).
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - Recipient must not already have a name.
    /// - Name must not already be registered.
    /// - Signature must be valid EIP-712 signature from `recipient` (EOA) or EIP-1271 contract signature.
    ///
    /// **Note:** Due to block reorganization risks, users should wait for a few blocks and verify
    /// the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.
    /// 
    /// @param registerNameAuth The argument for the function, including label, namespace, and recipient.
    /// @param signature EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature.
    function registerNameWithAuthorization(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) external payable {
        require(_isValidSlug(registerNameAuth.label), "XNS: invalid label");
        require(registerNameAuth.recipient != address(0), "XNS: 0x recipient");

        bytes32 nsHash = keccak256(bytes(registerNameAuth.namespace));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        // Enforce sponsorship rules:
        // - Public namespace: creator-only during exclusivity.
        // - Private namespace: creator-only forever.
        if (ns.isPrivate) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (private)");
        } else if (block.timestamp < ns.createdAt + EXCLUSIVITY_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (exclusivity period)");
        }

        require(
            bytes(_addressToName[registerNameAuth.recipient].label).length == 0,
            "XNS: recipient already has a name"
        );

        bytes32 key = keccak256(abi.encodePacked(registerNameAuth.label, ".", registerNameAuth.namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        require(_isValidSignature(registerNameAuth, signature), "XNS: bad authorization");

        _nameHashToAddress[key] = registerNameAuth.recipient;
        _addressToName[registerNameAuth.recipient] = Name({
            label: registerNameAuth.label,
            namespace: registerNameAuth.namespace
        });

        emit NameRegistered(registerNameAuth.label, registerNameAuth.namespace, registerNameAuth.recipient);

        // Process payment: burn 90%, credit fees, and refund excess.
        _processETHPayment(ns.pricePerName, ns.creator, ns.isPrivate);
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
    /// @return successfulCount The number of names successfully registered.
    function batchRegisterNameWithAuthorization(
        RegisterNameAuth[] calldata registerNameAuths,
        bytes[] calldata signatures
    ) external payable returns (uint256 successfulCount) {
        require(registerNameAuths.length == signatures.length, "XNS: length mismatch");
        require(registerNameAuths.length > 0, "XNS: empty array");

        bytes32 firstNsHash = keccak256(bytes(registerNameAuths[0].namespace));
        NamespaceData storage ns = _namespaces[firstNsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        // Enforce sponsorship rules:
        // - Private namespace: creator-only forever.
        // - Public namespace: creator-only during exclusivity.
        if (ns.isPrivate) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (private)");
        } else if (block.timestamp < ns.createdAt + EXCLUSIVITY_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator");
        }

        // Validate and register all names, skipping where the recipient already has a name
        // or the name is already registered.
        uint256 successful = 0;
        for (uint256 i = 0; i < registerNameAuths.length; i++) {
            RegisterNameAuth calldata auth = registerNameAuths[i];

            // Validations that should revert (invalid input).
            require(_isValidSlug(auth.label), "XNS: invalid label");
            require(auth.recipient != address(0), "XNS: 0x recipient");

            // Skip if recipient already has a name (protection against griefing attacks).
            if (bytes(_addressToName[auth.recipient].label).length > 0) {
                continue;
            }

            // Verify all are same namespace.
            bytes32 nsHash = keccak256(bytes(auth.namespace));
            require(nsHash == firstNsHash, "XNS: namespace mismatch");

            bytes32 key = keccak256(abi.encodePacked(auth.label, ".", auth.namespace));

            // Skip if name is already registered (protection against griefing attacks).
            if (_nameHashToAddress[key] != address(0)) {
                continue;
            }

            // Verify that the signature is valid.
            require(_isValidSignature(auth, signatures[i]), "XNS: bad authorization");

            _nameHashToAddress[key] = auth.recipient;
            _addressToName[auth.recipient] = Name({
                label: auth.label,
                namespace: auth.namespace
            });

            emit NameRegistered(auth.label, auth.namespace, auth.recipient);
            successful++;
        }

        if (successful > 0) {
            uint256 actualTotal = ns.pricePerName * successful;
            require(msg.value >= actualTotal, "XNS: insufficient payment");
            _processETHPayment(actualTotal, ns.creator, ns.isPrivate);
            return successful;
        }

        // If no registrations succeeded, refund all payment and return 0.
        if (msg.value > 0) {
            (bool ok, ) = msg.sender.call{value: msg.value}("");
            require(ok, "XNS: refund failed");
        }
        return 0;
    }

    /// @notice Register a new public namespace.
    ///
    /// **Requirements:**
    /// - Namespace must be valid (length 1–20, consists only of [a-z0-9-], cannot start or end with '-', cannot contain consecutive hyphens).
    /// - `msg.value` must be >= 50 ETH (excess refunded), except OWNER pays 0 ETH during initial period.
    /// - Namespace must not already exist.
    /// - Namespace must not equal "eth".
    /// - `pricePerName` must be a multiple of 0.001 ETH.
    ///
    /// **Note:**
    /// - During the onboarding period (1 year following contract deployment),
    ///   the owner pays no namespace registration fee.
    /// - Anyone can register a namespace for a 50 ETH fee within the onboarding period.
    /// - Front-running namespace registrations by the owner during the onboarding period
    ///   provides no economic benefit: the owner would only receive 5% of name
    ///   registration fees (vs 50 ETH upfront fee), and users can mitigate this by waiting until
    ///   after the 1-year period. This is an accepted design trade-off for simplicity.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPublicNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(_isValidSlug(namespace), "XNS: invalid namespace");

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(keccak256(bytes(namespace)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");

        bytes32 nsHash = keccak256(bytes(namespace));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        uint256 requiredAmount = 0;
        if (!(block.timestamp < DEPLOYED_AT + ONBOARDING_PERIOD && msg.sender == OWNER)) {
            requiredAmount = PUBLIC_NAMESPACE_REGISTRATION_FEE;
            require(msg.value >= requiredAmount, "XNS: insufficient namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            isPrivate: false
        });

        emit NamespaceRegistered(namespace, pricePerName, msg.sender, false);

        // Process payment: burn 90%, credit fees, and refund excess (if any).
        // `requiredAmount` = 0 within onboarding period (1 year after contract deployment).
        if (requiredAmount > 0) {
            _processETHPayment(requiredAmount, msg.sender, false);
        } else if (msg.value > 0) {
            // Refund if owner sent ETH during free period.
            (bool ok, ) = msg.sender.call{value: msg.value}("");
            require(ok, "XNS: refund failed");
        }
    }

    /// @notice Register a new private namespace.
    ///
    /// **Requirements:**
    /// - Namespace must be valid (length 1–20, consists only of [a-z0-9-],
    ///   cannot start or end with '-', cannot contain consecutive hyphens).
    /// - `msg.value` must be >= 10 ETH (excess refunded), except OWNER pays 0 ETH during initial period.
    /// - Namespace must not already exist.
    /// - Namespace must not equal "eth".
    /// - `pricePerName` must be >= 0.001 ETH and a multiple of 0.001 ETH.
    ///
    /// **Note:**
    /// - During the onboarding period (1 year following contract deployment),
    ///   the owner pays no namespace registration fee.
    /// - Anyone can register a namespace for a 10 ETH fee within the onboarding period.
    /// - Front-running namespace registrations by the owner during the onboarding period
    ///   provides no economic benefit: the owner would only receive 10% of name
    ///   registration fees (vs 10 ETH upfront fee), and users can mitigate this by waiting until
    ///   after the 1-year period. This is an accepted design trade-off for simplicity.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPrivateNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(_isValidSlug(namespace), "XNS: invalid namespace");

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(keccak256(bytes(namespace)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName >= PRICE_STEP, "XNS: pricePerName too low");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");

        bytes32 nsHash = keccak256(bytes(namespace));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        uint256 requiredAmount = 0;
        if (!(block.timestamp < DEPLOYED_AT + ONBOARDING_PERIOD && msg.sender == OWNER)) {
            requiredAmount = PRIVATE_NAMESPACE_REGISTRATION_FEE;
            require(msg.value >= requiredAmount, "XNS: insufficient namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            isPrivate: true
        });

        emit NamespaceRegistered(namespace, pricePerName, msg.sender, true);

        if (requiredAmount > 0) {
            _processETHPayment(requiredAmount, msg.sender, true);
        } else if (msg.value > 0) {
            (bool ok, ) = msg.sender.call{value: msg.value}("");
            require(ok, "XNS: refund failed");
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

    /// @notice Function to resolve a name string like "nike", "nike.x", "vitalik.001", "alice.my-private" to an address.
    /// @dev Returns `address(0)` for anything not registered or malformed. 
    /// If `fullName` contains no '.', it is treated as a bare name.
    ///
    /// @param fullName The name string to resolve.
    /// @return addr The address associated with the name, or `address(0)` if not registered.
    function getAddress(string calldata fullName) external view returns (address addr) {
        bytes memory b = bytes(fullName);
        uint256 len = b.length;
        if (len == 0) return address(0);

        // Find the last '.' by scanning from the end (handles both public and private namespaces).
        uint256 dotIndex = type(uint256).max; // Sentinel: no dot found
        for (uint256 i = len; i > 0; i--) {
            if (b[i - 1] == 0x2E) { // '.'
                dotIndex = i - 1;
                break;
            }
        }

        if (dotIndex == type(uint256).max) {
            // Bare label => label.x
            return _getAddress(fullName, BARE_NAME_NAMESPACE);
        }

        // Extract label and namespace.
        bytes memory labelBytes = new bytes(dotIndex);
        for (uint256 j = 0; j < dotIndex; j++) labelBytes[j] = b[j];

        uint256 nsLen = len - dotIndex - 1;
        bytes memory nsBytes = new bytes(nsLen);
        for (uint256 j = 0; j < nsLen; j++) nsBytes[j] = b[dotIndex + 1 + j];

        return _getAddress(string(labelBytes), string(nsBytes));
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

        if (keccak256(bytes(n.namespace)) == keccak256(bytes(BARE_NAME_NAMESPACE))) {
            // Bare name: return just the label without ".x"
            return n.label;
        }

        return string.concat(n.label, ".", n.namespace);
    }

    /// @notice Function to retrieve the namespace metadata associated with `namespace`.
    /// @param namespace The namespace to retrieve the metadata for.
    /// @return pricePerName The price per name for the namespace.
    /// @return creator The creator of the namespace.
    /// @return createdAt The timestamp when the namespace was created.
    /// @return isPrivate Whether the namespace is private.
    function getNamespaceInfo(
        string calldata namespace
    ) external view returns (uint256 pricePerName, address creator, uint64 createdAt, bool isPrivate) {
        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        return (ns.pricePerName, ns.creator, ns.createdAt, ns.isPrivate);
    }

    /// @notice Function to retrieve only the price per name for a given namespace.
    /// @dev More gas efficient than `getNamespaceInfo` if only the price is needed.
    /// @param namespace The namespace to retrieve the price for.
    /// @return pricePerName The price per name for the namespace.
    function getNamespacePrice(string calldata namespace) external view returns (uint256 pricePerName) {
        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        return ns.pricePerName;
    }

    /// @notice Function to check if a label or namespace is valid (returns bool, does not revert).
    ///
    /// **Requirements:**
    /// - Must be 1–20 characters long
    /// - Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
    /// - Cannot start or end with '-'
    /// - Cannot contain consecutive hyphens ('--')
    /// @param slug The label or namespace to check if is valid.
    /// @return isValid True if the slug is valid, false otherwise.
    function isValidSlug(string memory slug) external pure returns (bool isValid) {
        return _isValidSlug(slug);
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

    /// @dev Helper function to process ETH payment (used in `registerName`, `registerNameWithAuthorization`,
    /// `batchRegisterNameWithAuthorization`, `registerPublicNamespace`, and `registerPrivateNamespace`):
    /// - Burn 90% via DETH (credits `msg.sender` with DETH)
    /// - Credit fees:
    ///   - Public namespace: 5% to namespace creator, 5% to OWNER
    ///   - Private namespace: 10% to OWNER
    /// - Refund any excess payment
    /// @param requiredAmount The required amount of ETH for the operation (excess will be refunded).
    /// @param namespaceCreator The address of the namespace creator that shall receive a portion of the fees.
    /// @param isPrivateNamespace Whether the namespace is private.
    function _processETHPayment(uint256 requiredAmount, address namespaceCreator, bool isPrivateNamespace) private {
        uint256 burnAmount = (requiredAmount * 90) / 100;
        uint256 creatorFee = (requiredAmount * 5) / 100;
        uint256 ownerFee = requiredAmount - burnAmount - creatorFee;

        // Burn 90% via DETH contract and credit `msg.sender` (payer/sponsor) with DETH.
        IDETH(DETH).burn{value: burnAmount}(msg.sender);

        // Credit fees.
        if (isPrivateNamespace) {
            _pendingFees[OWNER] += (creatorFee + ownerFee);
        } else {
            _pendingFees[namespaceCreator] += creatorFee;
            _pendingFees[OWNER] += ownerFee;
        }

        // Refund excess payment.
        uint256 excess = msg.value - requiredAmount;
        if (excess > 0) {
            (bool success, ) = msg.sender.call{value: excess}("");
            require(success, "XNS: refund failed");
        }
    }

    /// @dev Helper function to check if a label or namespace is valid (same rules for both).
    /// Used in `registerName`, `isValidSlug`, and namespace registration functions.
    /// @param slug The label or namespace string to validate.
    /// @return isValid True if the slug is valid, false otherwise.
    function _isValidSlug(string memory slug) private pure returns (bool isValid) {
        bytes memory b = bytes(slug);
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


    /// @dev Internal function to verify EIP-712 signature for RegisterNameAuth.
    /// @param registerNameAuth The struct containing recipient, label, and namespace.
    /// @param signature The signature to verify.
    /// @return isValid True if the signature is valid, false otherwise.
    function _isValidSignature(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) private view returns (bool isValid) {
        bytes32 digest = _hashTypedDataV4(_getRegisterNameAuthHash(registerNameAuth));
        return SignatureChecker.isValidSignatureNow(registerNameAuth.recipient, digest, signature);
    }

    /// @dev Helper function to return hash of RegisterNameAuth details.
    /// @param registerNameAuth The struct containing recipient, label, and namespace.
    /// @return registerNameAuthHash The keccak256 hash of the RegisterNameAuth struct.
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
