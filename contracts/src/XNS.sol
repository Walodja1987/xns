// SPDX-License-Identifier: BUSL-1.1
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
/// @author Wladimir Weinbender (DIVA Technologies AG)
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
/// ### String rules
/// Label and namespace string requirements:
/// - Must be 1–20 characters long
/// - Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
/// - Cannot start or end with '-'
/// - Cannot contain consecutive hyphens ('--')
/// - "eth" as namespace is disallowed to avoid confusion with ENS
///
/// ### Namespaces
/// - Anyone can register new namespaces by paying a one-time fee.
/// - XNS features two types of namespaces: public and private.
/// - **Public namespaces (50 ETH):**
///   - Open to everyone after a 30-day exclusivity period post namespace registration.
///   - During exclusivity, only the creator can register or sponsor names (via `registerNameWithAuthorization`
///     or `batchRegisterNameWithAuthorization`).
///   - After exclusivity, anyone can register or sponsor names (via `registerName`
///     or `batchRegisterNameWithAuthorization`).
///   - Creators receive 10% of all name registration fees in perpetuity.
/// - **Private namespaces (10 ETH):**
///   - Only the creator can register names (via `registerNameWithAuthorization`
///     or `batchRegisterNameWithAuthorization`).
///   - Creators do not receive fees; all fees go to the XNS contract owner.
/// - During the first year post XNS contract deployment, the contract owner can register
///   namespaces for others at no cost.
/// - The "eth" namespace is disallowed to avoid confusion with ENS.
/// - The "x" namespace is associated with bare names (e.g. "vitalik" = "vitalik.x").
/// - The contract owner is set as the creator of the "x" namespace at deployment.
///
/// ### Bare Names
/// - Bare names are names without a namespace (e.g., "vitalik" instead of "vitalik.x").
/// - Internally, bare names use the special "x" namespace, so "vitalik" and "vitalik.x" resolve to the same address.
/// - Bare names are premium and cost 10 ETH per name.
///
/// ### Name Registration
/// - Users can register names in public namespaces after the 30-day exclusivity period using `registerName`.
/// - Each address can own at most one name.
/// - Registration fees vary by namespace
/// - Any excess payment is refunded.
///
/// ### Authorized Name Registration
/// - XNS features authorized name registration via EIP-712 signatures.
/// - Allows sponsors to pay registration fees on behalf of recipients who authorize it via signature.
/// - Supports both EOA signatures and EIP-1271 contract wallet signatures.
///
/// ### ETH Burn and Fee Distribution
/// - 80% of ETH sent is burnt via DETH.
/// - 20% is credited as fees:
///   - Public namespaces: 10% to namespace creator, 10% to XNS contract owner
///   - Private namespaces: 20% to XNS owner
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
        address recipient;
        string label;
        string namespace;
    }

    // -------------------------------------------------------------------------
    // Storage (private, accessed via getters)
    // -------------------------------------------------------------------------

    // Mapping from address to name (label, namespace). If label is empty, the address has no name.
    mapping(address => Name) private _addressToName;

    // Mapping from `keccak256(label, ".", namespace)` to name owner address.
    mapping(bytes32 => address) private _nameHashToAddress;

    // Mapping from `keccak256(namespace)` to namespace metadata.
    mapping(bytes32 => NamespaceData) private _namespaces;

    // Mapping from address to pending fees that can be claimed.
    mapping(address => uint256) private _pendingFees;

    // EIP-712 struct type hash for `RegisterNameAuth`.
    bytes32 private constant _REGISTER_NAME_AUTH_TYPEHASH =
        keccak256("RegisterNameAuth(address recipient,string label,string namespace)");

    // Hash of the forbidden "eth" namespace to avoid confusion with ENS.
    bytes32 private constant _ETH_NAMESPACE_HASH = keccak256(bytes("eth"));


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

    /// @notice Period after contract deployment during which the owner can use `registerPublicNamespaceFor` and
    /// `registerPrivateNamespaceFor` to bootstrap namespaces for participants at no cost. After this period, all
    /// namespace registrations (including by the owner) require standard fees via `registerPublicNamespace` or
    /// `registerPrivateNamespace`.
    uint256 public constant ONBOARDING_PERIOD = 365 days;

    /// @notice Unit price step (0.001 ETH).
    uint256 public constant PRICE_STEP = 0.001 ether;

    /// @notice Minimum price per name for public namespaces (0.001 ETH).
    uint256 public constant PUBLIC_NAMESPACE_MIN_PRICE = 0.001 ether;

    /// @notice Minimum price per name for private namespaces (0.005 ETH = 5x public minimum).
    uint256 public constant PRIVATE_NAMESPACE_MIN_PRICE = 0.005 ether;

    /// @notice Namespace associated with bare names (e.g. "vitalik" = "vitalik.x").
    string public constant BARE_NAME_NAMESPACE = "x";

    /// @notice Price for registering a bare name (e.g. "vitalik").
    uint256 public constant BARE_NAME_PRICE = 10 ether;

    /// @notice Address of DETH contract used to burn ETH and credit the recipient.
    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @dev Emitted in name registration functions.
    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);

    /// @dev Emitted in constructor when "x" namespace is registered, and in namespace registration functions.
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator, bool isPrivate);

    /// @dev Emitted in fee claiming functions.
    event FeesClaimed(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @dev Initializes the contract by setting the `OWNER` and deployment timestamp.
    /// Also pre-registers the special public namespace "x" (associated with bare names) with the given owner as its creator
    /// and a price of 10 ETH per name. Additionally, registers the bare name "xns" for the XNS contract itself.
    /// @param owner Address that will own the contract and receive protocol fees.
    constructor(address owner) EIP712("XNS", "1") {
        require(owner != address(0), "XNS: 0x owner");

        OWNER = owner;
        DEPLOYED_AT = uint64(block.timestamp);

        // Register special public namespace "x" associated with bare names as the very first namespace.
        _namespaces[keccak256(bytes(BARE_NAME_NAMESPACE))] = NamespaceData({
            pricePerName: BARE_NAME_PRICE,
            creator: owner,
            createdAt: uint64(block.timestamp),
            isPrivate: false
        });

        emit NamespaceRegistered(BARE_NAME_NAMESPACE, BARE_NAME_PRICE, owner, false);

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

    /// @notice Function to register a paid name for `msg.sender`. To register a bare name
    /// (e.g., "vitalik"), use "x" as the namespace parameter.
    /// This function only works for public namespaces after the exclusivity period (30 days) has ended.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
    ///   cannot start or end with '-', cannot contain consecutive hyphens ('--')).
    /// - Namespace must exist and be public.
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - Namespace must be past the exclusivity period (30 days after creation).
    /// - Caller must not already have a name.
    /// - Name must not already be registered.
    ///
    /// **Fee Distribution:**
    /// - 80% of ETH is permanently burned via DETH.
    /// - 10% is credited to the `OWNER`.
    /// - 10% is credited to the namespace creator.
    ///
    /// **Note:**
    /// - During the exclusivity period or for private namespaces, namespace creators must use
    ///   `registerNameWithAuthorization` even for their own registrations.
    /// - Due to block reorganization risks, users should wait for a few blocks and verify
    ///   the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.
    ///
    /// @param label The label part of the name to register.
    /// @param namespace The namespace part of the name to register.
    function registerName(string calldata label, string calldata namespace) external payable {
        require(_isValidLabelOrNamespace(label), "XNS: invalid label");

        NamespaceData memory ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        require(!ns.isPrivate, "XNS: only for public namespaces");

        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        require(block.timestamp > ns.createdAt + EXCLUSIVITY_PERIOD, "XNS: in exclusivity period");

        require(bytes(_addressToName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        _nameHashToAddress[key] = msg.sender;
        _addressToName[msg.sender] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, msg.sender);

        // Process payment: burn 80%, credit fees, and refund excess.
        _processETHPayment(ns.pricePerName, ns.creator);
    }

    /// @notice Function to sponsor a paid name registration for `recipient` who explicitly authorized it via
    /// an EIP-712 signature.
    ///
    /// This function is **required** for:
    /// - All registrations in public namespaces during the exclusivity period (only namespace creator).
    /// - All sponsored registrations in public namespaces after the exclusivity period (anyone).
    /// - All registrations in private namespaces.
    ///
    /// Supports both EOA signatures and EIP-1271 contract wallet signatures.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
    ///   cannot start or end with '-', cannot contain consecutive hyphens ('--')).
    /// - `recipient` must not be the zero address.
    /// - Namespace must exist.
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - `msg.sender` must be the namespace creator for public namespaces during the exclusivity period
    ///   or the `OWNER` for private namespaces.
    /// - Recipient must not already have a name.
    /// - Name must not already be registered.
    /// - Signature must be valid EIP-712 signature from `recipient` (EOA) or EIP-1271 contract signature.
    ///
    /// **Fee Distribution:**
    /// - 80% of ETH is permanently burned via DETH.
    /// - For public namespaces: 10% is credited to the namespace creator and 10% to the `OWNER`.
    /// - For private namespaces: 20% is credited to the `OWNER`.
    ///
    /// **Note:**
    /// - If the recipient is an EIP-7702 delegated account, their delegated implementation must implement ERC-1271
    ///   for signature validation.
    /// - Due to block reorganization risks, users should wait for a few blocks and verify
    /// the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.
    /// 
    /// @param registerNameAuth The argument for the function, including recipient, label, and namespace.
    /// @param signature EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature.
    function registerNameWithAuthorization(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) external payable {
        require(_isValidLabelOrNamespace(registerNameAuth.label), "XNS: invalid label");
        require(registerNameAuth.recipient != address(0), "XNS: 0x recipient");

        bytes32 nsHash = keccak256(bytes(registerNameAuth.namespace));
        NamespaceData memory ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        if (ns.isPrivate) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (private)");
        } else if (block.timestamp <= ns.createdAt + EXCLUSIVITY_PERIOD) {
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

        // Process payment: burn 80%, credit fees, and refund excess.
        address creatorFeeRecipient = ns.isPrivate ? OWNER : ns.creator;
        _processETHPayment(ns.pricePerName, creatorFeeRecipient);
    }

    /// @notice Batch version of `registerNameWithAuthorization` to register multiple names with a single transaction.
    /// All registrations must be in the same namespace. Skips registrations (i.e. does not revert) where the recipient already has
    /// a name or the name is already registered (griefing protection). Skipped items are not charged; excess payment is refunded.
    ///
    /// **Requirements:**
    /// - Array arguments must have equal length and be non-empty.
    /// - All registrations must be in the same namespace.
    /// - `msg.value` must be >= `pricePerName * successfulCount` (excess will be refunded).
    /// - All individual requirements from `registerNameWithAuthorization` apply to each registration.
    ///
    /// **Fee Distribution:**
    /// - 80% of ETH is permanently burned via DETH.
    /// - For public namespaces: 10% is credited to the namespace creator and 10% to the `OWNER`.
    /// - For private namespaces: 20% is credited to the `OWNER`.
    ///
    /// **Note:** Input validation errors (invalid label, zero recipient, namespace mismatch, invalid signature)
    /// cause the entire batch to revert. Errors that could occur due to front-running the batch tx (recipient already
    /// has a name, or name already registered) are skipped (i.e. batch tx does not revert) to provide griefing protection.
    ///
    /// @param registerNameAuths Array of `RegisterNameAuth` structs, each including recipient, label, and namespace.
    /// @param signatures Array of EIP-712 signatures by recipients (EOA) or EIP-1271 contract signatures.
    /// @return successfulCount The number of names successfully registered.
    function batchRegisterNameWithAuthorization(
        RegisterNameAuth[] calldata registerNameAuths,
        bytes[] calldata signatures
    ) external payable returns (uint256 successfulCount) {
        require(registerNameAuths.length == signatures.length, "XNS: length mismatch");
        require(registerNameAuths.length > 0, "XNS: empty array");

        bytes32 firstNsHash = keccak256(bytes(registerNameAuths[0].namespace));
        NamespaceData memory ns = _namespaces[firstNsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        if (ns.isPrivate) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (private)");
        } else if (block.timestamp <= ns.createdAt + EXCLUSIVITY_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (exclusivity period)");
        }

        // Validate and register all names, skipping where the recipient already has a name
        // or the name is already registered.
        uint256 successful = 0;
        for (uint256 i = 0; i < registerNameAuths.length; i++) {
            RegisterNameAuth calldata auth = registerNameAuths[i];

            require(_isValidLabelOrNamespace(auth.label), "XNS: invalid label");
            require(auth.recipient != address(0), "XNS: 0x recipient");

            bytes32 nsHash = keccak256(bytes(auth.namespace));
            require(nsHash == firstNsHash, "XNS: namespace mismatch");

            // Skip if recipient already has a name (protection against griefing attacks).
            if (bytes(_addressToName[auth.recipient].label).length > 0) {
                continue;
            }

            bytes32 key = keccak256(abi.encodePacked(auth.label, ".", auth.namespace));

            // Skip if name is already registered (protection against griefing attacks).
            if (_nameHashToAddress[key] != address(0)) {
                continue;
            }

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
            address creatorFeeRecipient = ns.isPrivate ? OWNER : ns.creator;

            // Process payment: burn 80%, credit fees, and refund excess.
            _processETHPayment(actualTotal, creatorFeeRecipient);
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
    /// - `msg.value` must be >= 50 ETH (excess refunded).
    /// - Namespace must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
    ///   cannot start or end with '-', cannot contain consecutive hyphens ('--')).
    /// - Namespace must not equal "eth".
    /// - Namespace must not already exist.
    /// - `pricePerName` must be >= 0.001 ETH and a multiple of 0.001 ETH (0.001, 0.002, 0.003, etc.).
    ///
    /// **Note:**
    /// - During the onboarding period (1 year following contract deployment), the contract owner can
    ///   register namespaces for free (via `registerPublicNamespaceFor`) to foster adoption.
    /// - For the avoidance of doubt, anyone can register a new namespace during the onboarding period
    ///   by paying the standard 50 ETH registration fee.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPublicNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(msg.value >= PUBLIC_NAMESPACE_REGISTRATION_FEE, "XNS: insufficient namespace fee");

        _registerNamespace(namespace, pricePerName, msg.sender, false);

        _processETHPayment(PUBLIC_NAMESPACE_REGISTRATION_FEE, OWNER);
    }

    /// @notice Register a new private namespace.
    ///
    /// **Requirements:**
    /// - `msg.value` must be >= 10 ETH (excess refunded).
    /// - Namespace must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
    ///   cannot start or end with '-', cannot contain consecutive hyphens ('--')).
    /// - Namespace must not equal "eth".
    /// - Namespace must not already exist.
    /// - `pricePerName` must be >= 0.005 ETH and a multiple of 0.001 ETH (0.005, 0.006, 0.007, etc.).
    ///
    /// **Note:**
    /// - During the onboarding period (1 year following contract deployment), the contract owner can
    ///   register namespaces for free (via `registerPrivateNamespaceFor`) to foster adoption.
    /// - For the avoidance of doubt, anyone can register a new namespace during the onboarding period
    ///   by paying the standard 10 ETH registration fee.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPrivateNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(msg.value >= PRIVATE_NAMESPACE_REGISTRATION_FEE, "XNS: insufficient namespace fee");

        _registerNamespace(namespace, pricePerName, msg.sender, true);

        _processETHPayment(PRIVATE_NAMESPACE_REGISTRATION_FEE, OWNER);
    }

    /// @notice OWNER-only function to register a public namespace for another address during the onboarding period.
    /// This function allows the contract owner to register namespaces for free during the first year to
    /// foster adoption. No ETH is processed (function is non-payable) and no fees are charged.
    ///
    /// **Requirements:**
    /// - `msg.sender` must be the contract owner.
    /// - Must be called during the onboarding period (first year after contract deployment).
    /// - `creator` must not be the zero address.
    /// - No ETH should be sent (function is non-payable).
    /// - All validation requirements from `registerPublicNamespace` apply.
    ///
    /// @param creator The address that will be assigned as the namespace creator (who will receive creator fees).
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPublicNamespaceFor(address creator, string calldata namespace, uint256 pricePerName) external {
        require(msg.sender == OWNER, "XNS: not owner");
        require(block.timestamp <= DEPLOYED_AT + ONBOARDING_PERIOD, "XNS: onboarding over");
        require(creator != address(0), "XNS: 0x creator");

        _registerNamespace(namespace, pricePerName, creator, false);
    }

    /// @notice OWNER-only function to register a private namespace for another address during the onboarding period.
    /// This function allows the contract owner to register namespaces for free during the first year to
    /// foster adoption. No ETH is processed (function is non-payable) and no fees are charged.
    ///
    /// **Requirements:**
    /// - `msg.sender` must be the contract owner.
    /// - Must be called during the onboarding period (first year after contract deployment).
    /// - `creator` must not be the zero address.
    /// - No ETH should be sent (function is non-payable).
    /// - All validation requirements from `registerPrivateNamespace` apply.
    ///
    /// @param creator The address that will be assigned as the namespace creator.
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPrivateNamespaceFor(address creator, string calldata namespace, uint256 pricePerName) external {
        require(msg.sender == OWNER, "XNS: not owner");
        require(block.timestamp <= DEPLOYED_AT + ONBOARDING_PERIOD, "XNS: onboarding over");
        require(creator != address(0), "XNS: 0x creator");

        _registerNamespace(namespace, pricePerName, creator, true);
    }

    /// @dev Helper function to register a namespace (used in namespace registration functions):
    /// - Validates namespace and pricePerName
    /// - Checks namespace doesn't exist
    /// - Writes namespace data to storage
    /// - Emits `NamespaceRegistered` event
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace. Must be >= 0.001 ETH for public namespaces,
    /// >= 0.005 ETH for private namespaces, and a multiple of 0.001 ETH.
    /// @param creator The address that will be assigned as the namespace creator.
    /// @param isPrivate Whether the namespace is private.
    function _registerNamespace(string calldata namespace, uint256 pricePerName, address creator, bool isPrivate) private {
        require(_isValidLabelOrNamespace(namespace), "XNS: invalid namespace");

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(keccak256(bytes(namespace)) != _ETH_NAMESPACE_HASH, "XNS: 'eth' namespace forbidden");

        bytes32 nsHash = keccak256(bytes(namespace));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        // Check minimum price based on namespace type (public namespaces are more common, check first)
        if (!isPrivate) {
            require(pricePerName >= PUBLIC_NAMESPACE_MIN_PRICE, "XNS: pricePerName too low");
        } else {
            require(pricePerName >= PRIVATE_NAMESPACE_MIN_PRICE, "XNS: pricePerName too low");
        }
        require(pricePerName % PRICE_STEP == 0, "XNS: price not multiple of 0.001 ETH");

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: creator,
            createdAt: uint64(block.timestamp),
            isPrivate: isPrivate
        });

        emit NamespaceRegistered(namespace, pricePerName, creator, isPrivate);
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
    /// @param recipient The address that will receive the claimed fees.
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

    /// @notice Function to resolve a name string like "vitalik", "bob.007", "alice.gm-web3" to an address.
    /// Returns `address(0)` for anything not registered or malformed. 
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
    /// This version is more gas efficient than `getAddress(string calldata fullName)` as it does not
    /// require string splitting. Returns `address(0)` if not registered.
    /// If `namespace` is empty, it is treated as a bare name (equivalent to "x" namespace).
    /// @param label The label part of the name.
    /// @param namespace The namespace part of the name. Use empty string "" for bare names.
    /// @return addr The address associated with the name, or `address(0)` if not registered.
    function getAddress(string calldata label, string calldata namespace) external view returns (address addr) {
        // If namespace is empty, treat as bare name (use "x" namespace)
        if (bytes(namespace).length == 0) {
            return _getAddress(label, BARE_NAME_NAMESPACE);
        }
        return _getAddress(label, namespace);
    }

    /// @dev Helper function for `getAddress(fullName)` and `getAddress(label, namespace)`.
    function _getAddress(string memory label, string memory namespace) private view returns (address addr) {
        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        return _nameHashToAddress[key];
    }

    /// @notice Function to lookup the XNS name for an address.
    /// Returns an empty string if the address has no name. For bare names (namespace "x"),
    /// returns just the label without the ".x" suffix. For regular names, returns the full name
    /// in format "label.namespace".
    /// @param addr The address to lookup the XNS name for.
    /// @return name The XNS name for the address, or empty string if the address has no name.
    function getName(address addr) external view returns (string memory) {
        Name memory n = _addressToName[addr];

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
        NamespaceData memory ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        return (ns.pricePerName, ns.creator, ns.createdAt, ns.isPrivate);
    }

    /// @notice Function to retrieve only the price per name for a given namespace.
    /// More gas efficient than `getNamespaceInfo` if only the price is needed.
    /// @param namespace The namespace to retrieve the price for.
    /// @return pricePerName The price per name for the namespace.
    function getNamespacePrice(string calldata namespace) external view returns (uint256 pricePerName) {
        NamespaceData memory ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        return ns.pricePerName;
    }

    /// @notice Function to check if a namespace is currently within its exclusivity period.
    /// Returns `true` if `block.timestamp <= createdAt + EXCLUSIVITY_PERIOD`, `false` otherwise.
    /// For private namespaces, this function will return `false` after the exclusivity period, but private namespaces
    /// remain creator-only forever regardless of this value.
    /// @param namespace The namespace to check.
    /// @return inExclusivityPeriod `true` if the namespace is within its exclusivity period, `false` otherwise.
    function isInExclusivityPeriod(string calldata namespace) external view returns (bool inExclusivityPeriod) {
        NamespaceData memory ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");
        return block.timestamp <= ns.createdAt + EXCLUSIVITY_PERIOD;
    }

    /// @notice Function to check if a label or namespace is valid (returns bool, does not revert).
    ///
    /// **Requirements:**
    /// - Must be 1–20 characters long
    /// - Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
    /// - Cannot start or end with '-'
    /// - Cannot contain consecutive hyphens ('--')
    /// @param labelOrNamespace The label or namespace to check if is valid.
    /// @return isValid True if the labelOrNamespace is valid, false otherwise.
    function isValidLabelOrNamespace(string calldata labelOrNamespace) external pure returns (bool isValid) {
        return _isValidLabelOrNamespace(labelOrNamespace);
    }


    /// @notice Function to check if a signature is valid (be used in `registerNameWithAuthorization`
    /// or `batchRegisterNameWithAuthorization`).
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
    /// - Burn 80% via DETH (credits `msg.sender` with DETH)
    /// - Credit fees: 10% to `creatorFeeRecipient` and 10% to `OWNER`
    /// - Refund any excess payment
    /// @param requiredAmount The required amount of ETH for the operation (excess will be refunded).
    /// @param creatorFeeRecipient The address that shall receive the 10% creator fee.
    function _processETHPayment(uint256 requiredAmount, address creatorFeeRecipient) private {
        uint256 burnAmount = (requiredAmount * 80) / 100;
        uint256 creatorFee = (requiredAmount * 10) / 100;
        uint256 ownerFee = requiredAmount - burnAmount - creatorFee;

        // Burn 80% via DETH contract and credit `msg.sender` (payer/sponsor) with DETH.
        IDETH(DETH).burn{value: burnAmount}(msg.sender);

        // Credit fees: 10% to `creatorFeeRecipient`, 10% to `OWNER`.
        // If `creatorFeeRecipient` == `OWNER`, `OWNER` effectively gets the full 20%
        // (credited twice into the same mapping slot).
        _pendingFees[creatorFeeRecipient] += creatorFee;
        _pendingFees[OWNER] += ownerFee;

        // Refund excess payment.
        uint256 excess = msg.value - requiredAmount;
        if (excess > 0) {
            (bool success, ) = msg.sender.call{value: excess}("");
            require(success, "XNS: refund failed");
        }
    }

    /// @dev Helper function to check if a label or namespace is valid (same rules for both).
    /// Used in name and namespace registration functions as well as in `isValidLabelOrNamespace` function.
    /// @param labelOrNamespace The label or namespace string to validate.
    /// @return isValid True if the labelOrNamespace is valid, false otherwise.
    function _isValidLabelOrNamespace(string calldata labelOrNamespace) private pure returns (bool isValid) {
        bytes memory b = bytes(labelOrNamespace);
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


    /// @dev Internal function to verify EIP-712 signature for `RegisterNameAuth`.
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

    /// @dev Helper function to return hash of `RegisterNameAuth` details.
    /// @param registerNameAuth The struct containing recipient, label, and namespace.
    /// @return registerNameAuthHash The keccak256 hash of the `RegisterNameAuth` struct.
    function _getRegisterNameAuthHash(
        RegisterNameAuth calldata registerNameAuth
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
