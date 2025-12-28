// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title RevertingReceiver
/// @notice Mock contract that reverts when receiving ETH, used for testing refund failures
contract RevertingReceiver {
    /// @notice Reverts when receiving ETH
    receive() external payable {
        revert("RevertingReceiver: cannot receive ETH");
    }

    /// @notice Fallback function that also reverts
    fallback() external payable {
        revert("RevertingReceiver: cannot receive ETH");
    }
}

