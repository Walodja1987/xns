// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IXNS {
    struct RegisterNameAuth {
        address recipient;
        string label;
        string namespace;
    }

    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed owner, bool isPrivate);
    event FeesClaimed(address indexed recipient, uint256 amount);
    event NamespaceOwnerTransferStarted(string indexed namespace, address indexed oldOwner, address indexed newOwner);
    event NamespaceOwnerTransferAccepted(string indexed namespace, address indexed newOwner);

    function registerName(string calldata label, string calldata namespace) external payable;
    function registerNameWithAuthorization(RegisterNameAuth calldata registerNameAuth, bytes calldata signature) external payable;
    function batchRegisterNameWithAuthorization(
        RegisterNameAuth[] calldata registerNameAuths,
        bytes[] calldata signatures
    ) external payable returns (uint256 successfulCount);
    function registerPublicNamespace(string calldata namespace, uint256 pricePerName) external payable;
    function registerPrivateNamespace(string calldata namespace, uint256 pricePerName) external payable;
    function registerPublicNamespaceFor(address nsOwner, string calldata namespace, uint256 pricePerName) external;
    function registerPrivateNamespaceFor(address nsOwner, string calldata namespace, uint256 pricePerName) external;
    function claimFees(address recipient) external;
    function claimFeesToSelf() external;
    function transferNamespaceOwnership(string calldata namespace, address newOwner) external;
    function acceptNamespaceOwnership(string calldata namespace) external;

    function getAddress(string calldata label, string calldata namespace) external view returns (address addr);
    function getAddress(string calldata fullName) external view returns (address addr);
    function getName(address addr) external view returns (string memory);
    function getNamespaceInfo(string calldata namespace) external view returns (uint256 pricePerName, address owner, uint64 createdAt, bool isPrivate);
    function getNamespacePrice(string calldata namespace) external view returns (uint256 pricePerName);
    function isInExclusivityPeriod(string calldata namespace) external view returns (bool inExclusivityPeriod);
    function isValidLabelOrNamespace(string calldata labelOrNamespace) external pure returns (bool isValid);
    function isValidSignature(RegisterNameAuth calldata registerNameAuth,bytes calldata signature) external view returns (bool isValid);
    function getPendingFees(address recipient) external view returns (uint256 amount);
    function getPendingNamespaceOwner(string calldata namespace) external view returns (address pendingOwner);

    // OpenZeppelin Ownable2Step functions (inherited, not declared in interface):
    // function transferOwnership(address newOwner) external;
    // function acceptOwnership() external;
    // function owner() external view returns (address);
    // function pendingOwner() external view returns (address);
}
