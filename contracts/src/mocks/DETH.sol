// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IDETH} from "../interfaces/IDETH.sol";

/// @title DETH
/// @notice Original DETH contract for testing purposes
contract DETH is IDETH {
    mapping(address => uint256) private _burned;
    uint256 private _totalBurned;

    /**
     * @notice Fallback function to allow direct ETH transfers. Credits DETH to `msg.sender`.
     * @dev `msg.data` must be empty. 
     */
    receive() external payable {
        _burn(msg.sender);
    }

    /**
     * @notice Burns ETH and credits DETH to the specified `dethRecipient` at a 1:1 ratio.
     * @param dethRecipient The address that will be credited with DETH.
     */
    function burn(address dethRecipient) external payable override {
        _burn(dethRecipient);
    }

    /**
     * @notice Returns the total ETH amount burned by the specified `user` (equivalent to DETH credited to `user`).
     * @param user The address to query.
     * @return The total ETH balance of the user.
     */
    function burned(address user) external view override returns (uint256) {
        return _burned[user];
    }

    /**
     * @notice Returns the total ETH amount burned across all users (equivalent to total DETH credited).
     * @return The total amount of ETH ever burned.
     */
    function totalBurned() external view override returns (uint256) {
        return _totalBurned;
    }

    /**
     * @notice Private function to burn ETH and credit DETH to the specified `dethRecipient`. Used in
     * both the `burn` and the `receive` function.
     * @param dethRecipient The address that will be credited with DETH.
     */
    function _burn(address dethRecipient) private {
        _burned[dethRecipient] += msg.value;
        _totalBurned += msg.value;
        emit ETHBurned(msg.sender, dethRecipient, msg.value);
    }
}

