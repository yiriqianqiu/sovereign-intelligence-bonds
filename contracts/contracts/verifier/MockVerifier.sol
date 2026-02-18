// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IHalo2Verifier.sol";

/**
 * @title MockVerifier - Test-only EZKL Halo2 Verifier Mock
 * @notice Always returns true for any proof. Used only in test environments.
 */
contract MockVerifier is IHalo2Verifier {
    function verifyProof(
        bytes calldata,
        uint256[] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
