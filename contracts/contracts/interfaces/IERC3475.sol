// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC3475 - Abstract Storage Bonds Standard
 * @notice Based on EIP-3475 by DeBond Protocol
 * @dev Semi-fungible bonds with classId (bond type) and nonceId (issuance batch)
 */
interface IERC3475 {
    struct Transaction {
        uint256 classId;
        uint256 nonceId;
        uint256 amount;
    }

    struct Values {
        string stringValue;
        uint256 uintValue;
        address addressValue;
        bool boolValue;
    }

    struct Metadata {
        string title;
        string _type;
        string description;
    }

    event Issue(address indexed operator, address indexed to, Transaction[] transactions);
    event Redeem(address indexed operator, address indexed from, Transaction[] transactions);
    event Burn(address indexed operator, address indexed from, Transaction[] transactions);
    event Transfer(
        address indexed operator,
        address indexed from,
        address indexed to,
        Transaction[] transactions
    );
    event ApprovalFor(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    function issue(address to, Transaction[] calldata transactions) external;
    function redeem(address from, Transaction[] calldata transactions) external;
    function burn(address from, Transaction[] calldata transactions) external;

    function transferFrom(
        address from,
        address to,
        Transaction[] calldata transactions
    ) external;

    function setApprovalFor(address operator, bool approved) external;
    function isApprovedFor(address owner, address operator) external view returns (bool);

    function balanceOf(
        address account,
        uint256 classId,
        uint256 nonceId
    ) external view returns (uint256);

    function totalSupply(uint256 classId, uint256 nonceId) external view returns (uint256);

    function classMetadata(uint256 metadataId) external view returns (Metadata memory);
    function nonceValues(uint256 classId, uint256 nonceId, uint256 metadataId)
        external
        view
        returns (Values memory);
    function classValues(uint256 classId, uint256 metadataId)
        external
        view
        returns (Values memory);
}
