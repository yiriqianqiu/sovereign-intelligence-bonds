// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library CreditModel {
    // 5 dimensions, weights sum to 10000 bps
    uint256 constant SHARPE_WEIGHT = 3500;
    uint256 constant STABILITY_WEIGHT = 2500;
    uint256 constant FREQUENCY_WEIGHT = 1500;
    uint256 constant AGE_WEIGHT = 1000;
    uint256 constant REVENUE_WEIGHT = 1500;
    uint256 constant TOTAL_WEIGHT = 10000;
    uint256 constant PRECISION = 1e18;

    struct CreditFactors {
        uint256 sharpeRatio;        // 1e18 scaled (e.g., 1.5e18 = 1.5 Sharpe)
        uint256 revenueStability;   // 1e18 scaled (0 = unstable, 1e18 = perfectly stable)
        uint256 paymentFrequency;   // 1e18 scaled (0 = never, 1e18 = continuous)
        uint256 agentAge;           // seconds since registration
        uint256 totalRevenue;       // wei total earned
    }

    // Rating thresholds on 10000 scale
    uint8 constant RATING_C = 1;    // score < 2000
    uint8 constant RATING_B = 2;    // score < 4000
    uint8 constant RATING_A = 3;    // score < 6000
    uint8 constant RATING_AA = 4;   // score < 8000
    uint8 constant RATING_AAA = 5;  // score >= 8000

    function calculateScore(CreditFactors memory factors) internal pure returns (uint256) {
        // Normalize each dimension to 0-10000 range
        uint256 sharpeScore = _normalizeSharpe(factors.sharpeRatio);
        uint256 stabilityScore = _normalizeRatio(factors.revenueStability);
        uint256 frequencyScore = _normalizeRatio(factors.paymentFrequency);
        uint256 ageScore = _normalizeAge(factors.agentAge);
        uint256 revenueScore = _normalizeRevenue(factors.totalRevenue);

        return (sharpeScore * SHARPE_WEIGHT +
                stabilityScore * STABILITY_WEIGHT +
                frequencyScore * FREQUENCY_WEIGHT +
                ageScore * AGE_WEIGHT +
                revenueScore * REVENUE_WEIGHT) / TOTAL_WEIGHT;
    }

    function calculateRating(uint256 score) internal pure returns (uint8) {
        if (score < 2000) return RATING_C;
        if (score < 4000) return RATING_B;
        if (score < 6000) return RATING_A;
        if (score < 8000) return RATING_AA;
        return RATING_AAA;
    }

    function calculateMultiDimensionalRating(CreditFactors memory factors)
        internal pure returns (uint8 rating, uint256 score)
    {
        score = calculateScore(factors);
        rating = calculateRating(score);
    }

    // Sharpe: 0->0, 1.0->3333, 2.0->6666, 3.0+->10000
    function _normalizeSharpe(uint256 sharpeRatio) private pure returns (uint256) {
        if (sharpeRatio == 0) return 0;
        if (sharpeRatio >= 3 * PRECISION) return 10000;
        // Linear: sharpeRatio / 3e18 * 10000
        return (sharpeRatio * 10000) / (3 * PRECISION);
    }

    // Ratio already 0-1e18, map to 0-10000
    function _normalizeRatio(uint256 ratio) private pure returns (uint256) {
        if (ratio >= PRECISION) return 10000;
        return (ratio * 10000) / PRECISION;
    }

    // Age: 0 days->0, 365+ days->10000 (linear)
    function _normalizeAge(uint256 agentAge) private pure returns (uint256) {
        if (agentAge >= 365 days) return 10000;
        return (agentAge * 10000) / 365 days;
    }

    // Revenue: 0->0, 100+ BNB->10000 (linear)
    function _normalizeRevenue(uint256 totalRevenue) private pure returns (uint256) {
        if (totalRevenue >= 100 ether) return 10000;
        return (totalRevenue * 10000) / 100 ether;
    }
}
