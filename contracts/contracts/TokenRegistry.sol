// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenRegistry is Ownable {
    struct TokenInfo {
        string symbol;
        uint8 decimals;
        uint256 priceUsd; // 1e18 scaled
        bool isActive;
        uint256 addedAt;
    }

    mapping(address => TokenInfo) private _tokens;
    address[] private _tokenList;

    event TokenAdded(address indexed token, string symbol);
    event TokenRemoved(address indexed token);
    event TokenPriceUpdated(address indexed token, uint256 newPrice);

    constructor(address initialOwner) Ownable(initialOwner) {
        // Register BNB as address(0)
        _tokens[address(0)] = TokenInfo({
            symbol: "BNB",
            decimals: 18,
            priceUsd: 300e18,
            isActive: true,
            addedAt: block.timestamp
        });
        _tokenList.push(address(0));

        emit TokenAdded(address(0), "BNB");
    }

    function addToken(
        address token,
        string calldata symbol,
        uint8 decimals,
        uint256 priceUsd
    ) external onlyOwner {
        require(token != address(0), "TokenRegistry: use constructor for BNB");
        require(!_tokens[token].isActive, "TokenRegistry: token already active");
        require(priceUsd > 0, "TokenRegistry: price must be positive");

        _tokens[token] = TokenInfo({
            symbol: symbol,
            decimals: decimals,
            priceUsd: priceUsd,
            isActive: true,
            addedAt: block.timestamp
        });
        _tokenList.push(token);

        emit TokenAdded(token, symbol);
    }

    function removeToken(address token) external onlyOwner {
        require(token != address(0), "TokenRegistry: cannot remove BNB");
        require(_tokens[token].isActive, "TokenRegistry: token not active");

        _tokens[token].isActive = false;

        emit TokenRemoved(token);
    }

    function updatePrice(address token, uint256 priceUsd) external onlyOwner {
        require(_tokens[token].isActive, "TokenRegistry: token not active");
        require(priceUsd > 0, "TokenRegistry: price must be positive");

        _tokens[token].priceUsd = priceUsd;

        emit TokenPriceUpdated(token, priceUsd);
    }

    function isTokenSupported(address token) external view returns (bool) {
        return _tokens[token].isActive;
    }

    function getTokenInfo(address token) external view returns (TokenInfo memory) {
        return _tokens[token];
    }

    function getTokenPrice(address token) external view returns (uint256) {
        require(_tokens[token].isActive, "TokenRegistry: token not active");
        return _tokens[token].priceUsd;
    }

    function getAllTokens() external view returns (address[] memory) {
        return _tokenList;
    }
}
