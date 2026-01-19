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
/// Label and namespace string requirements:
/// - Must be 1–20 characters long
/// - Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
/// - Cannot start or end with '-'
/// - Cannot contain consecutive hyphens ('--')
/// - "eth" as namespace is disallowed to avoid confusion with ENS
///
/// ### Name registration with public namespaces
/// - Users call `registerName(label, namespace)` and send ETH.
/// - This function only works for public namespaces **after** the exclusivity period (30 days).
/// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
/// - Each address can own at most one name.
///
/// ### Sponsorship via authorization (EIP-712 + EIP-1271)
/// - `registerNameWithAuthorization` is **required** for:
///   - All registrations during the exclusivity period (even namespace creators registering for themselves)
///   - All registrations in private namespaces (even namespace creators registering for themselves)
///   - All sponsored registrations (when someone else pays the fee)
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
///   - During this period, the creator must use `registerNameWithAuthorization` to register names (even for themselves)
///     and sponsor registrations for others.
///   - After the exclusivity period, the namespace is opened to the public for registrations using `registerName`.
/// - **Private namespaces:**
///   - Fee: 10 ETH
///   - Only the namespace creator may register names within their private namespace forever.
/// - During the onboarding period (first year after contract deployment), the XNS contract owner can optionally
///   bootstrap namespaces for participants and integrators at no cost using `registerPublicNamespaceFor` and
///   `registerPrivateNamespaceFor`. Regular users always pay standard fees via `registerPublicNamespace` and
///   `registerPrivateNamespace`, including the owner when using self-service functions.
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

    // EIP-712 struct type hash for RegisterNameAuth.
    bytes32 private constant _REGISTER_NAME_AUTH_TYPEHASH =
        keccak256("RegisterNameAuth(address recipient,string label,string namespace)");


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
    /// This function only works for public namespaces after the exclusivity period (30 days).
    /// For private namespaces or during the exclusivity period, use `registerNameWithAuthorization` instead.
    ///
    /// **Requirements:**
    /// - Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-',
    ///   cannot contain consecutive hyphens)
    /// - Namespace must exist and be public.
    /// - Namespace must be past the exclusivity period (30 days after creation).
    /// - `msg.value` must be >= the namespace's registered price (excess will be refunded).
    /// - Caller must not already have a name.
    /// - Name must not already be registered.
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
        require(_isValidSlug(label), "XNS: invalid label");

        NamespaceData storage ns = _namespaces[keccak256(bytes(namespace))];
        require(ns.creator != address(0), "XNS: namespace not found");

        require(msg.value >= ns.pricePerName, "XNS: insufficient payment");

        // Reject private namespaces - must use registerNameWithAuthorization
        require(!ns.isPrivate, "XNS: only for public namespaces");

        // Reject exclusivity period - must use registerNameWithAuthorization
        require(block.timestamp > ns.createdAt + EXCLUSIVITY_PERIOD, "XNS: use registerNameWithAuthorization during exclusivity period");

        require(bytes(_addressToName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace));
        require(_nameHashToAddress[key] == address(0), "XNS: name already registered");

        _nameHashToAddress[key] = msg.sender;
        _addressToName[msg.sender] = Name({label: label, namespace: namespace});

        emit NameRegistered(label, namespace, msg.sender);

        // Process payment: burn 90%, credit fees, and refund excess.
        // For public namespaces, creator receives 5% and OWNER receives 5%.
        _processETHPayment(ns.pricePerName, ns.creator);
    }

    /// @notice Function to sponsor a paid name registration for `recipient` who explicitly authorized it via
    /// signature. Allows a third party to pay gas and registration fees while the recipient explicitly approves
    /// via EIP-712 signature.
    ///
    /// This function is **required** for:
    /// - All registrations during the exclusivity period (even namespace creators registering for themselves)
    /// - All registrations in private namespaces (even namespace creators registering for themselves)
    /// - All sponsored registrations (when someone else pays the fee)
    ///
    /// For public namespaces during exclusivity period: only the namespace creator may sponsor registrations.
    /// For private namespaces: only the namespace creator may sponsor registrations forever.
    /// For public namespaces after exclusivity period: anyone may sponsor registrations.
    ///
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
    /// - If the recipient is an EIP-7702 delegated account, their delegated implementation must implement ERC-1271
    ///   for signature validation.
    ///
    /// **Note:** Due to block reorganization risks, users should wait for a few blocks and verify
    /// the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.
    /// 
    /// @param registerNameAuth The argument for the function, including label, namespace, and recipient.
    /// @param signature EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature.
    function registerNameWithAuthorization(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature // @todo reentrancy risk?
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

        // Process payment: burn 90%, credit fees, and refund excess.
        address creatorFeeRecipient = ns.isPrivate ? OWNER : ns.creator;
        _processETHPayment(ns.pricePerName, creatorFeeRecipient);
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
        } else if (block.timestamp <= ns.createdAt + EXCLUSIVITY_PERIOD) {
            require(msg.sender == ns.creator, "XNS: not namespace creator (exclusivity period)");
        }

        // Validate and register all names, skipping where the recipient already has a name
        // or the name is already registered.
        uint256 successful = 0;
        for (uint256 i = 0; i < registerNameAuths.length; i++) {
            RegisterNameAuth calldata auth = registerNameAuths[i];

            // Validations that should revert (invalid input).
            require(_isValidSlug(auth.label), "XNS: invalid label");
            require(auth.recipient != address(0), "XNS: 0x recipient");

            // Verify that the namespace is the same for all registrations.
            bytes32 nsHash = keccak256(bytes(auth.namespace));
            require(nsHash == firstNsHash, "XNS: namespace mismatch");

            // Verify that the signature is valid.
            require(_isValidSignature(auth, signatures[i]), "XNS: bad authorization");

            // Skip if recipient already has a name (protection against griefing attacks).
            if (bytes(_addressToName[auth.recipient].label).length > 0) {
                continue;
            }

            bytes32 key = keccak256(abi.encodePacked(auth.label, ".", auth.namespace));

            // Skip if name is already registered (protection against griefing attacks).
            if (_nameHashToAddress[key] != address(0)) {
                continue;
            }

            _nameHashToAddress[key] = auth.recipient;
            _addressToName[auth.recipient] = Name({
                label: auth.label,
                namespace: auth.namespace
            });

            emit NameRegistered(auth.label, auth.namespace, auth.recipient);
            successful++;
        }

        // @todo check reentrancy
        if (successful > 0) {
            uint256 actualTotal = ns.pricePerName * successful;
            require(msg.value >= actualTotal, "XNS: insufficient payment");
            address creatorFeeRecipient = ns.isPrivate ? OWNER : ns.creator;
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
    /// - Namespace must be valid (length 1–20, consists only of [a-z0-9-], cannot start or end with '-', cannot contain consecutive hyphens).
    /// - `msg.value` must be >= 50 ETH (excess refunded).
    /// - Namespace must not already exist.
    /// - Namespace must not equal "eth".
    /// - `pricePerName` must be >= 0.001 ETH and a multiple of 0.001 ETH.
    ///
    /// **Note:**
    /// - During the onboarding period (1 year following contract deployment), the contract owner can optionally
    ///   bootstrap namespaces for participants via `registerPublicNamespaceFor` at no cost.
    /// - All self-service registrations (including by the owner) require the full 50 ETH fee.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPublicNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(msg.value >= PUBLIC_NAMESPACE_REGISTRATION_FEE, "XNS: insufficient namespace fee");

        _registerNamespace(namespace, pricePerName, msg.sender, false);

        _processETHPayment(PUBLIC_NAMESPACE_REGISTRATION_FEE, OWNER); // @todo reentrancy risk oder vor register reinnehmen
    }

    /// @notice Register a new private namespace.
    ///
    /// **Requirements:**
    /// - Namespace must be valid (length 1–20, consists only of [a-z0-9-],
    ///   cannot start or end with '-', cannot contain consecutive hyphens).
    /// - `msg.value` must be >= 10 ETH (excess refunded).
    /// - Namespace must not already exist.
    /// - Namespace must not equal "eth".
    /// - `pricePerName` must be >= 0.005 ETH and a multiple of 0.001 ETH.
    ///
    /// **Note:**
    /// - During the onboarding period (1 year following contract deployment), the contract owner can optionally
    ///   bootstrap namespaces for participants via `registerPrivateNamespaceFor` at no cost.
    /// - All self-service registrations (including by the owner) require the full 10 ETH fee.
    ///
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPrivateNamespace(string calldata namespace, uint256 pricePerName) external payable {
        require(msg.value >= PRIVATE_NAMESPACE_REGISTRATION_FEE, "XNS: insufficient namespace fee");

        _registerNamespace(namespace, pricePerName, msg.sender, true);

        _processETHPayment(PRIVATE_NAMESPACE_REGISTRATION_FEE, OWNER); // @todo reentrancy risk oder vor register reinnehmen
    }

    /// @notice OWNER-only function to register a public namespace for another address during the onboarding period.
    /// This function allows the contract owner to bootstrap namespaces for participants and integrators at no cost
    /// during the first year after contract deployment. No fees are charged and no ETH is processed.
    ///
    /// **Requirements:**
    /// - `msg.sender` must be the contract owner.
    /// - Must be called during the onboarding period (first year after contract deployment).
    /// - `creator` must not be the zero address.
    /// - `msg.value` must be 0 (no ETH should be sent).
    /// - All validation requirements from `registerPublicNamespace` apply (namespace format, price, etc.).
    ///
    /// @param creator The address that will be set as the namespace creator.
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPublicNamespaceFor(address creator, string calldata namespace, uint256 pricePerName) external payable {
        require(msg.sender == OWNER, "XNS: not owner");
        require(block.timestamp <= DEPLOYED_AT + ONBOARDING_PERIOD, "XNS: onboarding over");
        require(creator != address(0), "XNS: 0x creator");
        require(msg.value == 0, "XNS: no ETH");

        _registerNamespace(namespace, pricePerName, creator, false);
    }

    /// @notice OWNER-only function to register a private namespace for another address during the onboarding period.
    /// This function allows the contract owner to bootstrap namespaces for participants and integrators at no cost
    /// during the first year after contract deployment. No fees are charged and no ETH is processed.
    ///
    /// **Requirements:**
    /// - `msg.sender` must be the contract owner.
    /// - Must be called during the onboarding period (first year after contract deployment).
    /// - `creator` must not be the zero address.
    /// - `msg.value` must be 0 (no ETH should be sent).
    /// - All validation requirements from `registerPrivateNamespace` apply (namespace format, price, etc.).
    ///
    /// @param creator The address that will be set as the namespace creator.
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace.
    function registerPrivateNamespaceFor(address creator, string calldata namespace, uint256 pricePerName) external payable {
        require(msg.sender == OWNER, "XNS: not owner");
        require(block.timestamp <= DEPLOYED_AT + ONBOARDING_PERIOD, "XNS: onboarding over");
        require(creator != address(0), "XNS: 0x creator");
        require(msg.value == 0, "XNS: no ETH");

        _registerNamespace(namespace, pricePerName, creator, true);
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
    /// - Credit fees: 5% to `creatorFeeRecipient` and 5% to OWNER
    /// - Refund any excess payment
    /// @param requiredAmount The required amount of ETH for the operation (excess will be refunded).
    /// @param creatorFeeRecipient The address that shall receive the 5% creator fee.
    /// @dev Credits 5% to `creatorFeeRecipient` and 5% to OWNER. Passing OWNER as `creatorFeeRecipient` routes the full 10% to OWNER.
    function _processETHPayment(uint256 requiredAmount, address creatorFeeRecipient) private {
        uint256 burnAmount = (requiredAmount * 90) / 100;
        uint256 creatorFee = (requiredAmount * 5) / 100;
        uint256 ownerFee = requiredAmount - burnAmount - creatorFee;

        // Burn 90% via DETH contract and credit `msg.sender` (payer/sponsor) with DETH.
        IDETH(DETH).burn{value: burnAmount}(msg.sender);

        // Credit fees: 5% to creatorFeeRecipient, 5% to OWNER.
        // If creatorFeeRecipient == OWNER, OWNER effectively gets the full 10% (credited twice into the same mapping slot).
        _pendingFees[creatorFeeRecipient] += creatorFee;
        _pendingFees[OWNER] += ownerFee;

        // Refund excess payment.
        uint256 excess = msg.value - requiredAmount;
        if (excess > 0) {
            (bool success, ) = msg.sender.call{value: excess}("");
            require(success, "XNS: refund failed");
        }
    }

    /// @dev Helper function to register a namespace (used in `registerPublicNamespace`, `registerPrivateNamespace`,
    /// `registerPublicNamespaceFor`, and `registerPrivateNamespaceFor`):
    /// - Validates namespace and pricePerName
    /// - Checks namespace doesn't exist
    /// - Writes namespace data to storage
    /// - Emits NamespaceRegistered event
    /// @param namespace The namespace to register.
    /// @param pricePerName The price per name for the namespace. Must be >= 0.001 ETH for public namespaces,
    ///   >= 0.005 ETH for private namespaces, and a multiple of 0.001 ETH.
    /// @param creator The address that will be set as the namespace creator.
    /// @param isPrivate Whether the namespace is private.
    /// @dev No ETH logic (no payment processing, no refunds). Pure validation + storage + event.
    function _registerNamespace(string calldata namespace, uint256 pricePerName, address creator, bool isPrivate) private {
        require(_isValidSlug(namespace), "XNS: invalid namespace");

        // Forbid "eth" namespace to avoid confusion with ENS.
        require(keccak256(bytes(namespace)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        // Check minimum price based on namespace type (public namespaces are more common, check first)
        if (!isPrivate) {
            require(pricePerName >= PUBLIC_NAMESPACE_MIN_PRICE, "XNS: pricePerName too low");
        } else {
            require(pricePerName >= PRIVATE_NAMESPACE_MIN_PRICE, "XNS: pricePerName too low for private namespace");
        }
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");

        bytes32 nsHash = keccak256(bytes(namespace));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: creator,
            createdAt: uint64(block.timestamp),
            isPrivate: isPrivate
        });

        emit NamespaceRegistered(namespace, pricePerName, creator, isPrivate);
    }

    /// @dev Helper function to check if a label or namespace is valid (same rules for both).
    /// Used in name and namespace registration functions as well as in `isValidSlug` function.
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
