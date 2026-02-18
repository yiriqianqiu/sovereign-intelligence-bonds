// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC3475.sol";

contract BondCollateralWrapper is ERC721, Ownable {
    struct WrappedPosition {
        uint256 classId;
        uint256 nonceId;
        uint256 amount;
    }

    address public bondManager;

    mapping(uint256 => WrappedPosition) public wrappedPositions;
    uint256 private _nextTokenId = 1;

    event Wrapped(uint256 indexed tokenId, address indexed owner, uint256 classId, uint256 nonceId, uint256 amount);
    event Unwrapped(uint256 indexed tokenId, address indexed owner, uint256 classId, uint256 nonceId, uint256 amount);

    constructor(address _bondManager) ERC721("SIB Collateral", "SIBC") Ownable(msg.sender) {
        require(_bondManager != address(0), "BCW: zero address");
        bondManager = _bondManager;
    }

    function wrap(uint256 classId, uint256 nonceId, uint256 amount) external returns (uint256 tokenId) {
        require(amount > 0, "BCW: zero amount");

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: nonceId, amount: amount});
        IERC3475(bondManager).transferFrom(msg.sender, address(this), txns);

        tokenId = _nextTokenId++;
        wrappedPositions[tokenId] = WrappedPosition({classId: classId, nonceId: nonceId, amount: amount});
        _mint(msg.sender, tokenId);

        emit Wrapped(tokenId, msg.sender, classId, nonceId, amount);
    }

    function unwrap(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "BCW: not owner");

        WrappedPosition memory pos = wrappedPositions[tokenId];

        _burn(tokenId);
        delete wrappedPositions[tokenId];

        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: pos.classId, nonceId: pos.nonceId, amount: pos.amount});
        IERC3475(bondManager).transferFrom(address(this), msg.sender, txns);

        emit Unwrapped(tokenId, msg.sender, pos.classId, pos.nonceId, pos.amount);
    }

    function getWrappedPosition(uint256 tokenId) external view returns (WrappedPosition memory) {
        require(wrappedPositions[tokenId].amount > 0, "BCW: not wrapped");
        return wrappedPositions[tokenId];
    }
}
