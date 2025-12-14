// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "./IXNS.sol";
import {IDETH} from "./IDETH.sol";

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

/**
 * @title XNS - An On-Chain Name Service
 * @author Wladimir Weinbender
 * @notice This contract provides a simple on-chain name service.
 */
contract XNS_old is IXNS {
    struct UserNames {
        string[] names;
        mapping(bytes32 => bool) ownsName;
        uint256 primaryIndex;
    }

    mapping(address => UserNames) private userToNames;
    mapping(bytes32 => address) public nameHashToOwners;

    uint256 public totalNamesRegistered;
    uint256 public accumulatedFees;
    uint256 public constant FEE_PERCENTAGE = 2;
    uint256 public constant X_UNLOCK_THRESHOLD = 100_000_000;
    uint256 public constant X_PRICE = 1000 ether;
    bytes32 public constant X_HASH = keccak256(abi.encodePacked("X"));
    address constant DETH = 0xE46861C9f28c46F27949fb471986d59B256500a7

    address public owner;

    event NameRegistered(address indexed user, string fullName);
    event PrimaryNameSet(address indexed user, string name);
    event FeesClaimed(address indexed recipient, uint256 amount);

    constructor(address _owner) {
        owner = _owner;
    }

    /**
     * @notice Initializes the XNS contract and assigns ETHPower its name for free.
     * @param _deth Address of the DETH contract on Ethereum.
     */
    constructor(address _owner) {
        owner = _owner;

        // Assign "DETH" (100 ETH variant) as a name for the DETH contract
        string memory dethContractName = "DETH";
        bytes32 nameHash = keccak256(abi.encodePacked(dethContractName));
        nameHashToOwner[nameHash] = DETH; // Assigns ownership to the DETH contract itself

        emit NameRegistered(DETH, dethContractName);
    }

    // @todo a function to name this contract as "XNS" for free

    function registerName(string memory _baseName, bool setAsPrimary) external payable {
        require(bytes(_baseName).length > 0, "Name cannot be empty.");
        require(msg.value > 0, "ETH amount must be greater than zero.");
        require(isValidETHAmount(msg.value), "Invalid ETH increment.");
        require(keccak256(abi.encodePacked(_baseName)) != X_HASH, "Use claimX() for X.");

        string memory fullName = getSuffixedName(_baseName, msg.value);
        bytes32 nameHash = keccak256(abi.encodePacked(fullName));

        require(nameHashToOwners[nameHash] == address(0), "Name with this suffix already taken.");

        _registerNameInternal(msg.sender, fullName, msg.value, setAsPrimary);
    }

    function claimX(bool setAsPrimary) external payable {
        require(totalNamesRegistered >= X_UNLOCK_THRESHOLD, "X is not unlocked yet.");
        require(msg.value == X_PRICE, "X costs exactly 1000 ETH.");
        require(nameHashToOwners[X_HASH] == address(0), "X has already been claimed.");

        _registerNameInternal(msg.sender, "X", msg.value, setAsPrimary);
    }

    function _registerNameInternal(address user, string memory fullName, uint256 amount, bool setAsPrimary) internal {
        bytes32 nameHash = keccak256(abi.encodePacked(fullName));
        uint256 fee = (amount * FEE_PERCENTAGE) / 100;
        accumulatedFees += fee;

        nameHashToOwners[nameHash] = user;
        userToNames[user].names.push(fullName);
        userToNames[user].ownsName[nameHash] = true;
        totalNamesRegistered++;

        if (setAsPrimary) {
            userToNames[user].primaryIndex = userToNames[user].names.length - 1;
            emit PrimaryNameForReverseLookupSet(user, fullName);
        }

        emit NameRegistered(user, fullName);
    }

    function setPrimaryNameForReverseLookup(uint256 _index) external {
        require(_index < userToNames[msg.sender].names.length, "Invalid index.");
        userToNames[msg.sender].primaryIndex = _index;
        emit PrimaryNameForReverseLookupSet(msg.sender, userToNames[msg.sender].names[_index]);
    }

    function claimAccumulatedFees(address recipient) external {
        require(msg.sender == owner, "Caller is not the owner.");
        _claimAccumulatedFeesInternal(recipient);
    }

    function claimAccumulatedFeesToSelf() external {
        require(msg.sender == owner, "Caller is not the owner.");
        _claimAccumulatedFeesInternal(owner);
    }

    function _claimAccumulatedFeesInternal(address recipient) private {
        uint256 amount = accumulatedFees; // Use accumulatedFees instead of the full balance
        require(amount > 0, "No fees to claim.");
        accumulatedFees = 0; // Reset the accumulated fees to zero

        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "ETH transfer failed.");

        emit FeesClaimed(recipient, amount);
    }

    function getFeeParameter() external pure returns (uint256) {
        return FEE_PERCENTAGE;
    }

    function getAccumulatedFees() external view returns (uint256) {
        return accumulatedFees;
    }

    function getPrimaryNameForReverseLookup(address _user) external view returns (string memory) {
        uint256 primaryIndex = userToNames[_user].primaryIndex;
        return userToNames[_user].names[primaryIndex];
    }

    function getAddress(string memory _fullName) external view returns (address) {
        return nameHashToOwners[keccak256(abi.encodePacked(_fullName))];
    }

    function getNames(address _user) external view returns (string[] memory) {
        return userToNames[_user].names; // ✅ Directly return the full array
    }

    function getName(address _user) external view returns (string memory) {
        uint256 primaryIndex = userToNames[_user].primaryIndex;
        return userToNames[_user].names[primaryIndex];
    }

    function getUserNames(address _user, uint256 from, uint256 to) public view returns (string[] memory) {
        uint256 len = userToNames[_user].names.length;
        require(from <= to && to <= len, "Invalid indices.");

        string[] memory namesSubset = new string[](to - from);
        for (uint256 i = from; i < to; i++) {
            namesSubset[i - from] = userToNames[_user].names[i];
        }
        return namesSubset;
    }

    function isValidETHAmount(uint256 _amount) public pure returns (bool) {
        if (_amount < 1 ether) return (_amount % 0.001 ether == 0);
        if (_amount < 10 ether) return (_amount % 1 ether == 0);
        if (_amount < 100 ether) return (_amount % 5 ether == 0);
        return (_amount == 100 ether || _amount == 1000 ether);
    }
    function getSuffixedName(string memory _baseName, uint256 _amount) public pure returns (string memory) {
        if (_amount < 1 ether) {
            return string(abi.encodePacked(_baseName, ".", uintToString(_amount / 1e15)));
        } else {
            return string(abi.encodePacked(_baseName, getNamedSuffix(_amount)));
        }
    }
    function getNamedSuffix(uint256 _amount) public pure returns (string memory) {
        if (_amount == 1 ether) return ".eth"; // 𖢻 "I'm in it for the tech"
        if (_amount == 2 ether) return ".gm"; // 🌞 Checks portfolio before brushing teeth
        if (_amount == 3 ether) return ".degen"; // 🎰 Thinks sleep is a bear market strategy
        if (_amount == 4 ether) return ".wtf"; // 🤯 Bought LUNA and FTT "just in case"
        if (_amount == 5 ether) return ".bro"; // 🤝 Gives crypto tips at divorce hearings
        if (_amount == 6 ether) return ".chad"; // 💪 Measures gains in lambos per minute
        if (_amount == 7 ether) return ".og"; // 🎖 Has more failed ICO tokens than friends
        if (_amount == 9 ether) return ".hodl"; // 💎 Married to their bags (literally, had a ceremony)
        if (_amount == 10 ether) return ".maxi"; // Ξ🦇🔊 "Solana is a SQL database"
        if (_amount == 15 ether) return ".bull"; // 🦬 Red candles are just discounts
        if (_amount == 20 ether) return ".whale"; // 🐋 Causes bear markets by taking profits
        if (_amount == 25 ether) return ".pump"; // 🚀 Thinks sell walls are conspiracy theories
        if (_amount == 30 ether) return ".100x"; // 💯 Uses leverage to leverage leverage
        if (_amount == 35 ether) return ".defi"; // 📱 Buidling YOLO contracts
        if (_amount == 40 ether) return ".ape"; // 🦍 Gets liquidated just to feel something
        if (_amount == 45 ether) return ".moon"; // 🌕 Earth's gravity can't hold these gains
        if (_amount == 50 ether) return ".X"; // 👔 CZ's financial advisor
        if (_amount == 100 ether) return ""; // @todo needed becaue it will return "" anyways (see next line)
        return "";
    }

    function uintToString(uint256 _value) internal pure returns (string memory) {
        if (_value == 0) return "0";
        uint256 temp = _value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (_value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(_value % 10)));
            _value /= 10;
        }
        return string(buffer);
    }


    // function collectReservedName(string memory baseName, string memory suffix) external {
    //     require(bytes(baseName).length > 0, "Base name cannot be empty.");
    //     require(bytes(suffix).length > 0, "Suffix cannot be empty.");

    //     string memory fullName = string(abi.encodePacked(baseName, suffix));
    //     bytes32 nameHash = keccak256(abi.encodePacked(fullName));
    //     bytes32 suffixHash = keccak256(abi.encodePacked(suffix));

    //     require(suffixActive[suffixHash], "Suffix not activated.");
    //     address recipient = initializedNameRecipients[suffixHash][nameHash];
    //     require(recipient != address(0), "Name not initialized.");
    //     require(nameHashToOwners[nameHash] == address(0), "Name already claimed.");

    //     // ✅ Assign ownership ONLY to the pre-set recipient
    //     nameHashToOwners[nameHash] = recipient;

    //     // ✅ Remove from temporary storage
    //     delete initializedNameRecipients[suffixHash][nameHash];

    //     emit NameClaimed(recipient, fullName);
    // }



}