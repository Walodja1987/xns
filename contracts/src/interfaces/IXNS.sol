// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IXNS {
    struct RegisterNameAuth {
        address recipient;
        string label;
        string namespace;
    }

    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator);
    event FeesClaimed(address indexed recipient, uint256 amount);

    function registerName(string calldata label, string calldata namespace) external payable;
    function registerNameWithAuthorization(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) external payable;
    function batchRegisterNameWithAuthorization(
        RegisterNameAuth[] calldata registerNameAuths,
        bytes[] calldata signatures
    ) external payable returns (uint256 successfulCount);
    function registerNamespace(string calldata namespace, uint256 pricePerName) external payable;
    function claimFees(address recipient) external;
    function claimFeesToSelf() external;

    function getAddress(string calldata label, string calldata namespace) external view returns (address addr);
    function getAddress(string calldata fullName) external view returns (address addr);
    function getName(address addr) external view returns (string memory);
    function getNamespaceInfo(string calldata namespace) external view returns (uint256 pricePerName, address creator, uint64 createdAt);
    function getNamespaceInfo(uint256 price) external view returns (string memory namespace, uint256 pricePerName, address creator, uint64 createdAt);
    function isValidLabel(string memory label) external pure returns (bool isValid);
    function isValidNamespace(string memory namespace) external pure returns (bool isValid);
    function isValidSignature(
        RegisterNameAuth calldata registerNameAuth,
        bytes calldata signature
    ) external view returns (bool isValid);
    function getPendingFees(address recipient) external view returns (uint256 amount);
}
