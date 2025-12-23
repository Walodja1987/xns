// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.23;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IDIVAVoucher} from "./interfaces/IDIVAVoucher.sol";

/**
 * @title DIVAVoucher
 * @notice A contract for managing personalized, digital asset-backed EIP712-signed vouchers.
 * Deposits are made by directly sending the voucher or gas token to the contract. Hence no
 * deposit function has been implemented.
 * @dev The voucher design is compatible with the handshake pattern to protect against front-running.
 * @author Wladimir Weinbender
 *
 * Variable/function naming convention:
 * - Storage variables do not have a leading underscore (e.g., `address private issuer`).
 * - Local variables, function arguments, and internal/private functions are prefixed with an
 *   underscore (e.g., `function _privateFunction(uint256 _arg)`).
 */
contract DIVAVoucher is IDIVAVoucher, EIP712Upgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Address of the designated signer of the vouchers associated with the escrow.
    address private issuer;

    mapping(bytes32 => bool) private hashedSecretToIsCancelled;
    mapping(bytes32 => bool) private hashedSecretToIsRedeemed;
    mapping(bytes32 => bool) private typedVoucherHashToIsCancelled;
    mapping(bytes32 => bool) private typedVoucherHashToIsRedeemed;

    // The type hash for voucher:
    // keccak256(
    //     abi.encodePacked(
    //         "Voucher(",
    //         "address issuer,"
    //         "address redeemableWithToken,"
    //         "bytes32 hashedSecret,"
    //         "address recipient,"
    //         "address voucherToken,"
    //         "uint256 voucherTokenAmount,"
    //         "uint256 gasTokenAmount,"
    //         "uint256 expiry,"
    //         "uint256 salt)"
    //     )
    // )
    bytes32 private constant VOUCHER_TYPEHASH = 0x40576af54f0c68b1f4e2023919b1fc86b19528f9093bb7e095391d894603c20e;

    // Bit mask to mask dirty bits in the voucher hash calculation (`_getVoucherHash`).
    uint256 private constant ADDRESS_MASK = (1 << 160) - 1;

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert MsgSenderNotIssuer(msg.sender, issuer);
        _;
    }

    constructor() {
        /* @dev To prevent the implementation contract from being used, invoke the {_disableInitializers}
         * function in the constructor to automatically lock it when it is deployed.
         * For more information, refer to @openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol
         */
        _disableInitializers();
    }

    /// @inheritdoc IDIVAVoucher
    function initialize(address _issuer) external override initializer {
        __EIP712_init("DIVAVoucher", "1");

        if (_issuer == address(0)) revert Address0Error();

        issuer = _issuer;
    }

    // Function to receive the native gas token (e.g., ETH on Ethereum). `msg.data` must be empty
    // to ensure successful execution. This condition is typically met on plain gas token transfers.
    receive() external payable {}

    /// @inheritdoc IDIVAVoucher
    function redeem(Voucher calldata _voucher, Signature calldata _signature) external override nonReentrant {
        // Get voucher info including typed voucher hash and status.
        VoucherInfo memory _voucherInfo = _getVoucherInfo(_voucher);

        // Must be redeemable.
        if (_voucherInfo.status != VoucherStatus.REDEEMABLE) revert VoucherNotRedeemable(_voucherInfo.status);

        // Check that the signature is valid.
        if (!_isValidSignature(_voucherInfo.typedVoucherHash, _signature, _voucher.issuer)) revert InvalidSignature();

        // Invalidate hashed secret / voucher to avoid reuse. Function will revert within `_getVoucherInfo` if reused.
        if (_voucher.hashedSecret != bytes32(0)) {
            hashedSecretToIsRedeemed[_voucher.hashedSecret] = true;
        } else {
            typedVoucherHashToIsRedeemed[_voucherInfo.typedVoucherHash] = true;
        }

        // Transfer `voucherTokenAmount` to `msg.sender`. Reverts with `ERC20InsufficientBalance`
        // inside `safeTransfer` if escrow has insufficient funds.
        if (_voucher.voucherTokenAmount != 0) {
            IERC20(_voucher.voucherToken).safeTransfer(msg.sender, _voucher.voucherTokenAmount);
        }

        // Transfer `gasTokenAmount` to `msg.sender`. Reverts if escrow has insufficient funds.
        if (_voucher.gasTokenAmount != 0) {
            (bool success, ) = msg.sender.call{value: _voucher.gasTokenAmount}("");
            if (!success) revert FailedGasTokenTransfer();
        }

        emit VoucherRedeemed(
            _voucherInfo.typedVoucherHash,
            _voucher.hashedSecret,
            _voucher.issuer,
            msg.sender, // recipient
            _voucher.voucherToken,
            _voucher.voucherTokenAmount,
            _voucher.gasTokenAmount
        );
    }

    /// @inheritdoc IDIVAVoucher
    function withdrawRemainder(address[] calldata _tokens) external override onlyIssuer nonReentrant {
        // Not a problem if duplicate array items are provided. User will just spend more gas.

        uint256 _balance;
        uint256 _len = _tokens.length;
        for (uint256 _i = 0; _i < _len; ++_i) {
            if (_tokens[_i] != address(0)) {
                IERC20 _tokenInstance = IERC20(_tokens[_i]);
                _balance = _tokenInstance.balanceOf(address(this));
                _tokenInstance.safeTransfer(msg.sender, _balance);
            } else {
                _balance = address(this).balance;
                (bool _success, ) = msg.sender.call{value: _balance}("");
                if (!_success) revert FailedGasTokenTransfer();
            }

            emit Withdrawn(msg.sender, _tokens[_i], _balance);
        }
    }

    /// @inheritdoc IDIVAVoucher
    function withdraw(WithdrawArgs[] calldata _withdrawArgs) external override onlyIssuer nonReentrant {
        // Not a problem if duplicate array items are provided. User will just spend more gas.

        uint256 _len = _withdrawArgs.length;
        for (uint256 _i = 0; _i < _len; ++_i) {
            if (_withdrawArgs[_i].token != address(0)) {
                IERC20 _tokenInstance = IERC20(_withdrawArgs[_i].token);
                _tokenInstance.safeTransfer(msg.sender, _withdrawArgs[_i].amount);
            } else {
                (bool _success, ) = msg.sender.call{value: _withdrawArgs[_i].amount}("");
                if (!_success) revert FailedGasTokenTransfer();
            }

            emit Withdrawn(msg.sender, _withdrawArgs[_i].token, _withdrawArgs[_i].amount);
        }
    }

    /// @inheritdoc IDIVAVoucher
    function cancelHashedSecrets(bytes32[] calldata _hashedSecrets) external onlyIssuer nonReentrant {
        // Not a problem if duplicate array items are provided. User will just spend more gas.
        // 0x will be ignored (see rationale before the if-block).

        uint256 _len = _hashedSecrets.length;
        for (uint256 _i = 0; _i < _len; ++_i) {
            // It's important to avoid flagging hashed secrets equal to 0x as cancelled. Otherwise
            // `_getVoucherInfo` will incorrectly return a CANCELLED status for all vouchers with
            // `hashedSecret = 0x`, resulting in the unintended rejection of those vouchers during redemption.
            if (_hashedSecrets[_i] != bytes32(0)) {
                // Flag the hashed secret as cancelled.
                hashedSecretToIsCancelled[_hashedSecrets[_i]] = true;

                // Log cancellation event (msg.sender = issuer).
                emit HashedSecretCancelled(_hashedSecrets[_i], msg.sender);
            }
        }
    }

    /// @inheritdoc IDIVAVoucher
    function cancelVouchers(Voucher[] calldata _vouchers) external onlyIssuer nonReentrant {
        // Not a problem if duplicate array items are provided. User will just spend more gas.

        uint256 _len = _vouchers.length;
        for (uint256 _i = 0; _i < _len; ++_i) {
            bytes32 _typedVoucherHash = _hashTypedDataV4(_getVoucherHash(_vouchers[_i]));
            // Flag the `_typedVoucherHash` as cancelled.
            typedVoucherHashToIsCancelled[_typedVoucherHash] = true;

            // Log cancellation event (msg.sender = issuer).
            emit VoucherCancelled(_typedVoucherHash, msg.sender);
        }
    }

    /*--------------------------------------------------------------------------
                                    VIEW FUNCTIONS
    --------------------------------------------------------------------------*/

    /// @inheritdoc IDIVAVoucher
    function getVoucherState(
        Voucher calldata _voucher,
        Signature calldata _signature
    )
        external
        view
        override
        returns (
            VoucherInfo memory voucherInfo,
            bool isValidSignature,
            uint256 actualRedeemableVoucherTokenAmount,
            uint256 actualRedeemableGasTokenAmount
        )
    {
        // Get voucher info including typed voucher hash and status.
        voucherInfo = _getVoucherInfo(_voucher);

        // Check whether signer is `issuer` and the signature is valid.
        isValidSignature = _isValidSignature(voucherInfo.typedVoucherHash, _signature, _voucher.issuer);

        if (voucherInfo.status == VoucherStatus.REDEEMABLE) {
            // Check whether there are sufficient funds in the escrow. Partial fills are not possible.
            if (IERC20(_voucher.voucherToken).balanceOf(address(this)) >= _voucher.voucherTokenAmount) {
                actualRedeemableVoucherTokenAmount = _voucher.voucherTokenAmount;
            }

            if (address(this).balance >= _voucher.gasTokenAmount) {
                actualRedeemableGasTokenAmount = _voucher.gasTokenAmount;
            }

            // else:
            // actualRedeemableVoucherTokenAmount = 0 by default
            // actualRedeemableGasTokenAmount = 0 by default
        }

        // else:
        // actualRedeemableVoucherTokenAmount = 0 by default
        // actualRedeemableGasTokenAmount = 0 by default
    }

    /// @inheritdoc IDIVAVoucher
    function getBalanceOf(address _token) external view override returns (uint256) {
        if (_token != address(0)) {
            return IERC20(_token).balanceOf(address(this));
        } else {
            return address(this).balance;
        }
    }

    /// @inheritdoc IDIVAVoucher
    function getIssuer() external view override returns (address) {
        return issuer;
    }

    /*--------------------------------------------------------------------------
                                    PRIVATE FUNCTIONS
    --------------------------------------------------------------------------*/

    /**
     * @notice Function to retrieve information about a voucher, including its typed hash and status.
     * @dev This function computes the typed hash of the voucher, checks its redemption status,
     * and determines its current validity and authorization status based on multiple criteria.
     * Note that the caller of this function should be the designated recipient, otherwise the function
     * will return `UNAUTHORIZED` status.
     * @param _voucher Struct containing all relevant details of the voucher.
     * @return voucherInfo Struct containing the following details:
     *         - typedVoucherHash: The EIP-712 compliant typed hash of the voucher.
     *         - status: The current status of the voucher, which can be one of the following:
     *           INVALID if the voucher's issuer does not match the designated issuer,
     *           UNAUTHORIZED if the `msg.sender` is not the intended recipient or lacks the required redeemable token (if specified),
     *           CANCELLED if the secret hash / voucher has been marked as cancelled,
     *           REDEEMED if the secret hash / voucher has already been redeemed,
     *           EXPIRED if the voucher has passed its expiry time,
     *           REDEEMABLE if none of the above conditions are met and the voucher is still valid for redemption.
     */
    function _getVoucherInfo(Voucher calldata _voucher) private view returns (VoucherInfo memory voucherInfo) {
        // Derive typed voucher hash from `_voucher` and populate the `typedVoucherHash` field
        // in return variable.
        voucherInfo.typedVoucherHash = _hashTypedDataV4(_getVoucherHash(_voucher));

        // Get voucher status:

        // Voucher is invalid if the issuer specified in the voucher does not match the `issuer`
        // initialized at escrow creation.
        if (_voucher.issuer != issuer) {
            voucherInfo.status = VoucherStatus.INVALID;
            return voucherInfo;
        }

        // Confirm that `msg.sender` corresponds to the specified voucher `recipient`.
        if (msg.sender != _voucher.recipient) {
            voucherInfo.status = VoucherStatus.UNAUTHORIZED;
            return voucherInfo;
        }

        // Check whether `recipient` owns the `redeemableWithToken` (if specified).
        if (
            _voucher.redeemableWithToken != address(0) &&
            IERC721(_voucher.redeemableWithToken).balanceOf(msg.sender) == 0
        ) {
            voucherInfo.status = VoucherStatus.UNAUTHORIZED;
            return voucherInfo;
        }

        // Check whether hashed secret / voucher is cancelled.
        if (
            hashedSecretToIsCancelled[_voucher.hashedSecret] ||
            typedVoucherHashToIsCancelled[voucherInfo.typedVoucherHash]
        ) {
            voucherInfo.status = VoucherStatus.CANCELLED;
            return voucherInfo;
        }

        // Check whether hashed secret / voucher has already been redeemed.
        if (
            hashedSecretToIsRedeemed[_voucher.hashedSecret] ||
            typedVoucherHashToIsRedeemed[voucherInfo.typedVoucherHash]
        ) {
            voucherInfo.status = VoucherStatus.REDEEMED;
            return voucherInfo;
        }

        // Check for voucher expiration.
        if (_voucher.expiry <= block.timestamp) {
            voucherInfo.status = VoucherStatus.EXPIRED;
            return voucherInfo;
        }

        // Set voucher status to redeemable if none of the above is true.
        voucherInfo.status = VoucherStatus.REDEEMABLE;
    }

    /**
     * @dev Function to validate that a given signature belongs to a given voucher hash.
     * @param _typedVoucherHash Voucher hash.
     * @param _signature Voucher signature.
     * @param _issuer Issuer address as specified in the voucher.
     */
    function _isValidSignature(
        bytes32 _typedVoucherHash,
        Signature memory _signature,
        address _issuer
    ) private pure returns (bool isSignatureValid) {
        // Recover voucher issuer address with `_typedVoucherHash` and `_signature` using tryRecover function from ECDSA library.
        address recoveredVoucherIssuer = ECDSA.recover(_typedVoucherHash, _signature.v, _signature.r, _signature.s);

        // Check that `recoveredVoucherIssuer` is not zero address.
        if (recoveredVoucherIssuer == address(0)) {
            isSignatureValid = false;
        }
        // Check that issuer address is equal to `recoveredVoucherIssuer`.
        else {
            isSignatureValid = _issuer == recoveredVoucherIssuer;
        }
    }

    // Return hash of voucher details.
    function _getVoucherHash(Voucher memory _voucher) private pure returns (bytes32 voucherHash) {
        // Assembly for more efficient computing:
        // Inspired by https://github.com/0xProject/protocol/blob/1fa093be6490cac52dfc17c31cd9fe9ff47ccc5e/contracts/zero-ex/contracts/src/features/libs/LibNativeOrder.sol#L179
        // keccak256(
        //     abi.encode(
        //         VOUCHER_TYPEHASH,
        //         _voucher.issuer,
        //         _voucher.redeemableWithToken,
        //         _voucher.hashedSecret,
        //         _voucher.recipient,
        //         _voucher.voucherToken,
        //         _voucher.voucherTokenAmount,
        //         _voucher.gasTokenAmount,
        //         _voucher.expiry,
        //         _voucher.salt
        //     )
        // )
        assembly {
            let mem := mload(0x40)
            mstore(mem, VOUCHER_TYPEHASH)
            // _voucher.issuer;
            mstore(add(mem, 0x20), and(ADDRESS_MASK, mload(_voucher)))
            // _voucher.redeemableWithToken;
            mstore(add(mem, 0x40), and(ADDRESS_MASK, mload(add(_voucher, 0x20))))
            // _voucher.hashedSecret;
            mstore(add(mem, 0x60), mload(add(_voucher, 0x40)))
            // _voucher.recipient;
            mstore(add(mem, 0x80), mload(add(_voucher, 0x60)))
            // _voucher.voucherToken;
            mstore(add(mem, 0xA0), and(ADDRESS_MASK, mload(add(_voucher, 0x80))))
            // _voucher.voucherTokenAmount;
            mstore(add(mem, 0xC0), mload(add(_voucher, 0xA0)))
            // _voucher.gasTokenAmount;
            mstore(add(mem, 0xE0), mload(add(_voucher, 0xC0)))
            // _voucher.expiry;
            mstore(add(mem, 0x100), mload(add(_voucher, 0xE0)))
            // _voucher.salt;
            mstore(add(mem, 0x120), mload(add(_voucher, 0x100)))

            voucherHash := keccak256(mem, 0x140)
        }
    }
}
