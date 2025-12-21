// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IDETH {
    event ETHBurned(address indexed sender, address indexed dethRecipient, uint256 amount);

    function burn(address dethRecipient) external payable;
    function burned(address user) external view returns (uint256);
    function totalBurned() external view returns (uint256);
}
