// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../libraries/CreditModel.sol";

/// @dev Helper contract to expose CreditModel library functions for testing
contract CreditModelHelper {
    function calculateScore(CreditModel.CreditFactors memory factors) external pure returns (uint256) {
        return CreditModel.calculateScore(factors);
    }

    function calculateRating(uint256 score) external pure returns (uint8) {
        return CreditModel.calculateRating(score);
    }

    function calculateMultiDimensionalRating(CreditModel.CreditFactors memory factors)
        external pure returns (uint8 rating, uint256 score)
    {
        return CreditModel.calculateMultiDimensionalRating(factors);
    }
}
