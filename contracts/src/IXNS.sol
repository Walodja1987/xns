// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IXNS {
    struct Assignment {
        string label;
        address to;
    }

    event NameRegistered(string indexed label, string indexed namespace, address indexed owner);
    event NamespaceRegistered(string indexed namespace, uint256 pricePerName, address indexed creator);
    event FeesClaimed(address indexed recipient, uint256 amount);

    function registerName(string calldata label) external payable;
    function registerNamespace(string calldata namespace, uint256 pricePerName) external payable;
    function claimFees(address recipient) external;
    function claimFeesToSelf() external;
    function assignFreeNames(string calldata namespace, Assignment[] calldata assignments) external;

    function getAddress(string calldata label, string calldata namespace) external view returns (address addr);
    function getAddress(string calldata fullName) external view returns (address addr);
    function getName(address addr) external view returns (string memory label, string memory namespace);
    function getNamespaceInfo(string calldata namespace) external view returns (uint256 pricePerName, address creator, uint64 createdAt, uint16 remainingFreeNames);
    function getNamespaceInfo(uint256 price) external view returns (string memory namespace, uint256 pricePerName, address creator_, uint64 createdAt, uint16 remainingFreeNames);
    function isValidLabel(string memory label) external pure returns (bool);
    function isValidNamespace(string memory namespace) external pure returns (bool);
    function getPendingFees(address recipient) external view returns (uint256);
}
