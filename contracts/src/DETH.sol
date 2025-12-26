// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IDETH} from "./interfaces/IDETH.sol";

/// @title DETH
/// @notice Mock DETH contract for testing purposes
/// @dev This is a simplified implementation of the DETH contract interface for local testing
contract DETH is IDETH {
    mapping(address => uint256) private _burned;
    uint256 private _totalBurned;

    /// @notice Burn ETH and credit DETH to recipient
    /// @param dethRecipient Address to credit DETH to
    function burn(address dethRecipient) external payable {
        require(dethRecipient != address(0), "DETH: zero address");
        
        _burned[dethRecipient] += msg.value;
        _totalBurned += msg.value;
        
        emit ETHBurned(msg.sender, dethRecipient, msg.value);
    }

    /// @notice Get total amount of ETH burned for a user
    /// @param user Address to query
    /// @return Amount of ETH burned for the user
    function burned(address user) external view returns (uint256) {
        return _burned[user];
    }

    /// @notice Get total amount of ETH burned across all users
    /// @return Total amount of ETH burned
    function totalBurned() external view returns (uint256) {
        return _totalBurned;
    }

    /// @notice Receive ETH directly (fallback for direct transfers)
    receive() external payable {
        _burned[msg.sender] += msg.value;
        _totalBurned += msg.value;
        emit ETHBurned(msg.sender, msg.sender, msg.value);
    }

    /// @notice Fallback function to reject calls with data
    fallback() external payable {
        revert("DETH: no data allowed");
    }
}

