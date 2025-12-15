// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IDETH {
    function burn(address dethRecipient) external payable;
}

/// @title XNSRegistry
/// @notice Ethereum-only on-chain name service: burn ETH to register permanent names.
/// @dev
/// - Names are permanent, immutable, non-transferable.
/// - One name per address globally.
/// - Namespace is determined by msg.value via a price->namespace mapping.
/// - Special namespace is "x": bare labels (e.g. "nike") are treated as "nike.x".
/// - ETH is burned via the canonical DETH registry (credits DETH to msg.sender).
/// - Optional commit-reveal for both names and namespaces to reduce mempool sniping.
contract XNSRegistryRef {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct NamespaceData {
        uint256 pricePerName;
        address creator;
        uint64 createdAt;
        uint16 remainingFreeNames; // starts at 200, counts down to 0
    }

    struct Claim {
        string label;
        address owner;
    }

    struct Name {
        string label;
        string namespace_;
    }

    // -------------------------------------------------------------------------
    // Storage (private, accessed via getters)
    // -------------------------------------------------------------------------

    /// @dev keccak256(label, ".", namespace) -> owner
    mapping(bytes32 => address) private _records;

    /// @dev keccak256(namespace) -> NamespaceData
    mapping(bytes32 => NamespaceData) private _namespaces;

    /// @dev pricePerName (wei) -> namespace string
    mapping(uint256 => string) private _priceToNamespace;

    /// @dev owner -> (label, namespace). If label empty, owner has no name.
    mapping(address => Name) private _reverseName;

    /// @dev commitment -> commit timestamp (seconds since epoch)
    mapping(bytes32 => uint64) private _nameCommitTime;

    /// @dev commitment -> commit timestamp (seconds since epoch)
    mapping(bytes32 => uint64) private _namespaceCommitTime;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev Canonical DETH registry on Ethereum mainnet (fixed).
    address public constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7;

    /// @dev One-time fee to create a namespace (unless deployer within first year).
    uint256 public constant NAMESPACE_REGISTRATION_FEE = 200 ether;

    /// @dev Free-name quota per namespace.
    uint16 public constant MAX_FREE_NAMES_PER_NAMESPACE = 200;

    /// @dev 30-day exclusivity window for paid registrations in a new namespace.
    uint256 public constant NS_CREATOR_EXCLUSIVE_PERIOD = 30 days;

    /// @dev Deployer pays no namespace registration fee in the first year.
    uint256 public constant CREATOR_FREE_NAMESPACE_PERIOD = 365 days;

    /// @dev All namespace prices must be multiples of 0.001 ETH.
    uint256 public constant PRICE_STEP = 1e15; // 0.001 ether

    /// @dev Special namespace backing bare labels.
    string public constant SPECIAL_NAMESPACE = "x";

    /// @dev Price for special namespace registrations (bare names).
    uint256 public constant SPECIAL_NAMESPACE_PRICE = 100 ether;

    /// @dev Commit-reveal timing.
    uint256 public constant MIN_COMMIT_DELAY = 60 seconds;
    uint256 public constant MAX_COMMIT_AGE = 1 days;

    /// @dev Contract deployer.
    address public immutable creator;

    /// @dev Deployment timestamp.
    uint64 public immutable deployedAt;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event NameRegistered(string indexed label, string indexed namespace_, address indexed owner);
    event NamespaceRegistered(string indexed namespace_, uint256 pricePerName, address indexed creator);

    event NameCommit(bytes32 indexed commitment, address indexed committer, uint64 timestamp);
    event NamespaceCommit(bytes32 indexed commitment, address indexed committer, uint64 timestamp);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() {
        creator = msg.sender;
        deployedAt = uint64(block.timestamp);

        // Register the special namespace "x" as the first namespace.
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
    // STATE-CHANGING FUNCTIONS
    // =========================================================================

    // ---- Commit phase (optional MEV protection) ----

    /// @notice Commit to a label (name) using a commitment hash.
    /// @dev Commitment binds to (label, owner, secret). Not to tier/price.
    function commitName(bytes32 commitment) external {
        require(commitment != bytes32(0), "XNS: zero commitment");
        require(_nameCommitTime[commitment] == 0, "XNS: commitment exists");
        _nameCommitTime[commitment] = uint64(block.timestamp);
        emit NameCommit(commitment, msg.sender, uint64(block.timestamp));
    }

    /// @notice Commit to a namespace using a commitment hash.
    /// @dev Commitment binds to (namespace, owner, secret). Not to pricePerName.
    function commitNamespace(bytes32 commitment) external {
        require(commitment != bytes32(0), "XNS: zero commitment");
        require(_namespaceCommitTime[commitment] == 0, "XNS: commitment exists");
        _namespaceCommitTime[commitment] = uint64(block.timestamp);
        emit NamespaceCommit(commitment, msg.sender, uint64(block.timestamp));
    }

    // ---- Namespace registration ----

    /// @notice Register a new namespace and assign a price-per-name.
    /// @dev One-tx path (no commit required).
    function registerNamespace(string calldata namespace_, uint256 pricePerName) external payable {
        _registerNamespace(namespace_, pricePerName, msg.value, false, bytes32(0));
    }

    /// @notice Register a new namespace using commit-reveal.
    /// @dev Requires a prior commitNamespace(commitment) and a 60s delay.
    function registerNamespaceWithCommit(
        string calldata namespace_,
        uint256 pricePerName,
        bytes32 secret
    ) external payable {
        // commitment binds to namespace + msg.sender + secret (not price)
        bytes32 commitment = keccak256(abi.encodePacked(namespace_, msg.sender, secret));
        _registerNamespace(namespace_, pricePerName, msg.value, true, commitment);
    }

    // ---- Name registration ----

    /// @notice Register a paid name for msg.sender. Namespace is determined by msg.value.
    /// @dev One-tx path (no commit required).
    function register(string calldata label) external payable {
        _registerName(label, msg.value, false, bytes32(0), bytes32(0));
    }

    /// @notice Register a paid name for msg.sender using commit-reveal.
    /// @dev Requires a prior commitName(commitment) and a 60s delay.
    ///      Commitment binds to (label, msg.sender, secret). Not to tier/price.
    function registerWithCommit(string calldata label, bytes32 secret) external payable {
        bytes32 commitment = keccak256(abi.encodePacked(label, msg.sender, secret));
        _registerName(label, msg.value, true, commitment, secret);
    }

    // ---- Free names (namespace creator reward) ----

    /// @notice Namespace creator assigns free names (up to 200 total per namespace).
    /// @dev Can be used at any time until remainingFreeNames reaches 0.
    function claimFreeNames(string calldata namespace_, Claim[] calldata claims) external {
        require(msg.value == 0, "XNS: no ETH for free registration");
        require(claims.length > 0, "XNS: empty claims");
        require(_isValidNamespace(namespace_), "XNS: invalid namespace");

        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];

        require(ns.creator != address(0), "XNS: namespace not found");
        require(msg.sender == ns.creator, "XNS: not namespace creator");
        require(claims.length <= ns.remainingFreeNames, "XNS: free name quota exceeded");

        for (uint256 i = 0; i < claims.length; i++) {
            string memory label = claims[i].label;
            address owner = claims[i].owner;

            require(_isValidLabel(label), "XNS: invalid label");
            require(owner != address(0), "XNS: zero owner");
            require(bytes(_reverseName[owner].label).length == 0, "XNS: owner already has a name");

            bytes32 key = keccak256(abi.encodePacked(label, ".", namespace_));
            require(_records[key] == address(0), "XNS: name already registered");

            _records[key] = owner;
            _reverseName[owner] = Name({label: label, namespace_: namespace_});

            emit NameRegistered(label, namespace_, owner);
        }

        ns.remainingFreeNames -= uint16(claims.length);
    }

    // =========================================================================
    // GETTERS / VIEW FUNCTIONS
    // =========================================================================

    /// @notice Resolve a name to an address.
    /// @dev
    /// - "label" (no dot) is treated as "label.x" (special namespace).
    /// - Otherwise split at the last dot and interpret as "label.namespace".
    /// - Returns address(0) if not registered.
    function getAddress(string calldata fullName) external view returns (address owner) {
        (string memory label, string memory namespace_) = _splitName(fullName);

        require(_isValidLabel(label), "XNS: invalid label");
        require(_isValidNamespace(namespace_), "XNS: invalid namespace");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace_));
        return _records[key];
    }

    /// @notice Reverse lookup: get the (label, namespace) for an address.
    /// @dev Returns empty strings if the address has no name.
    function getName(address owner) external view returns (string memory label, string memory namespace_) {
        Name storage n = _reverseName[owner];
        return (n.label, n.namespace_);
    }

    /// @notice Get the namespace string for a given price (wei). Returns empty string if unmapped.
    function getNamespace(uint256 price) external view returns (string memory namespace_) {
        return _priceToNamespace[price];
    }

    /// @notice Get namespace metadata by namespace string.
    function getNamespaceInfo(string calldata namespace_)
        external
        view
        returns (uint256 pricePerName, address creator_, uint64 createdAt, uint16 remainingFreeNames)
    {
        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");
        return (ns.pricePerName, ns.creator, ns.createdAt, ns.remainingFreeNames);
    }

    /// @notice Get namespace metadata by price and also return the namespace string.
    function getNamespaceInfo(uint256 price)
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

    /// @notice Public validity checker for labels (on-chain / Etherscan).
    function isValidLabel(string calldata label) external pure returns (bool) {
        return _isValidLabel(label);
    }

    /// @notice Public validity checker for namespaces (on-chain / Etherscan).
    function isValidNamespace(string calldata namespace_) external pure returns (bool) {
        return _isValidNamespace(namespace_);
    }

    /// @notice Helper to compute a name commitment off-chain or on-chain.
    /// @dev Commitment binds to (label, owner, secret).
    function makeNameCommitment(
        string calldata label,
        address owner,
        bytes32 secret
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(label, owner, secret));
    }

    /// @notice Helper to compute a namespace commitment off-chain or on-chain.
    /// @dev Commitment binds to (namespace, owner, secret).
    function makeNamespaceCommitment(
        string calldata namespace_,
        address owner,
        bytes32 secret
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(namespace_, owner, secret));
    }

    /// @notice Check whether a name commitment is currently revealable.
    function canRevealName(bytes32 commitment) external view returns (bool) {
        uint64 t = _nameCommitTime[commitment];
        if (t == 0) return false;
        if (block.timestamp < t + MIN_COMMIT_DELAY) return false;
        if (block.timestamp > t + MAX_COMMIT_AGE) return false;
        return true;
    }

    /// @notice Check whether a namespace commitment is currently revealable.
    function canRevealNamespace(bytes32 commitment) external view returns (bool) {
        uint64 t = _namespaceCommitTime[commitment];
        if (t == 0) return false;
        if (block.timestamp < t + MIN_COMMIT_DELAY) return false;
        if (block.timestamp > t + MAX_COMMIT_AGE) return false;
        return true;
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _registerNamespace(
        string calldata namespace_,
        uint256 pricePerName,
        uint256 feePaid,
        bool useCommit,
        bytes32 commitment
    ) internal {
        require(_isValidNamespace(namespace_), "XNS: invalid namespace");

        // forbid "eth" (inlined string compare)
        require(keccak256(bytes(namespace_)) != keccak256(bytes("eth")), "XNS: 'eth' namespace forbidden");

        require(pricePerName > 0, "XNS: pricePerName must be > 0");
        require(pricePerName % PRICE_STEP == 0, "XNS: price must be multiple of 0.001 ETH");
        require(bytes(_priceToNamespace[pricePerName]).length == 0, "XNS: price already in use");

        bytes32 nsHash = keccak256(bytes(namespace_));
        require(_namespaces[nsHash].creator == address(0), "XNS: namespace already exists");

        // Commit-reveal checks (optional)
        if (useCommit) {
            uint64 t = _namespaceCommitTime[commitment];
            require(t != 0, "XNS: no commitment");
            require(block.timestamp >= t + MIN_COMMIT_DELAY, "XNS: too early");
            require(block.timestamp <= t + MAX_COMMIT_AGE, "XNS: commitment expired");
            delete _namespaceCommitTime[commitment];
        }

        bool creatorDiscount = (msg.sender == creator && block.timestamp < deployedAt + CREATOR_FREE_NAMESPACE_PERIOD);

        if (creatorDiscount) {
            require(feePaid == 0, "XNS: creator pays no fee in first year");
        } else {
            require(feePaid == NAMESPACE_REGISTRATION_FEE, "XNS: wrong namespace fee");
        }

        _namespaces[nsHash] = NamespaceData({
            pricePerName: pricePerName,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            remainingFreeNames: MAX_FREE_NAMES_PER_NAMESPACE
        });

        _priceToNamespace[pricePerName] = namespace_;

        emit NamespaceRegistered(namespace_, pricePerName, msg.sender);

        if (feePaid != 0) {
            IDETH(DETH).burn{value: feePaid}(msg.sender);
        }
    }

    function _registerName(
        string calldata label,
        uint256 paid,
        bool useCommit,
        bytes32 commitment,
        bytes32 /*secret*/
    ) internal {
        require(_isValidLabel(label), "XNS: invalid label");
        require(paid > 0, "XNS: zero price");

        // Determine namespace from paid amount
        string memory namespace_ = _priceToNamespace[paid];
        require(bytes(namespace_).length != 0, "XNS: price not mapped to namespace");

        // namespace exists check
        bytes32 nsHash = keccak256(bytes(namespace_));
        NamespaceData storage ns = _namespaces[nsHash];
        require(ns.creator != address(0), "XNS: namespace not found");

        // Commit-reveal checks (optional)
        if (useCommit) {
            uint64 t = _nameCommitTime[commitment];
            require(t != 0, "XNS: no commitment");
            require(block.timestamp >= t + MIN_COMMIT_DELAY, "XNS: too early");
            require(block.timestamp <= t + MAX_COMMIT_AGE, "XNS: commitment expired");
            delete _nameCommitTime[commitment];
        }

        // Paid exclusivity window
        if (block.timestamp < ns.createdAt + NS_CREATOR_EXCLUSIVE_PERIOD) {
            require(msg.sender == ns.creator, "XNS: namespace in exclusive period");
        }

        require(bytes(_reverseName[msg.sender].label).length == 0, "XNS: address already has a name");

        bytes32 key = keccak256(abi.encodePacked(label, ".", namespace_));
        require(_records[key] == address(0), "XNS: name already registered");

        // Effects
        _records[key] = msg.sender;
        _reverseName[msg.sender] = Name({label: label, namespace_: namespace_});
        emit NameRegistered(label, namespace_, msg.sender);

        // Interaction: burn via DETH, credit msg.sender.
        IDETH(DETH).burn{value: paid}(msg.sender);
    }

    /// @dev Split fullName into (label, namespace).
    /// - If there is no dot, namespace becomes SPECIAL_NAMESPACE ("x").
    /// - Otherwise split at the last dot.
    function _splitName(string calldata fullName) internal pure returns (string memory label, string memory namespace_) {
        bytes memory b = bytes(fullName);
        if (b.length == 0) revert("XNS: empty name");

        int256 lastDot = -1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == 0x2E) lastDot = int256(i); // '.'
        }

        if (lastDot == -1) {
            return (fullName, SPECIAL_NAMESPACE);
        }

        uint256 dotIndex = uint256(lastDot);
        if (dotIndex == 0 || dotIndex >= b.length - 1) revert("XNS: invalid full name");

        bytes memory bl = new bytes(dotIndex);
        for (uint256 i = 0; i < dotIndex; i++) bl[i] = b[i];

        uint256 nsLen = b.length - dotIndex - 1;
        bytes memory bn = new bytes(nsLen);
        for (uint256 i = 0; i < nsLen; i++) bn[i] = b[dotIndex + 1 + i];

        return (string(bl), string(bn));
    }

    /// @dev Label validity:
    /// - 1–20 chars
    /// - [a-z0-9-]
    /// - no leading/trailing '-'
    function _isValidLabel(string memory label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len == 0 || len > 20) return false;

        if (b[0] == 0x2D || b[len - 1] == 0x2D) return false; // '-'

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLower = (c >= 0x61 && c <= 0x7A);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isHyphen = (c == 0x2D);
            if (!(isLower || isDigit || isHyphen)) return false;
        }
        return true;
    }

    /// @dev Namespace validity:
    /// - 1–4 chars
    /// - [a-z0-9]
    function _isValidNamespace(string memory namespace_) internal pure returns (bool) {
        bytes memory b = bytes(namespace_);
        uint256 len = b.length;
        if (len == 0 || len > 4) return false;

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLower = (c >= 0x61 && c <= 0x7A);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            if (!(isLower || isDigit)) return false;
        }
        return true;
    }
}
