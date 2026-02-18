// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IHalo2Verifier - EZKL Halo2 Proof Verifier Interface
 * @notice Public interface for EZKL-generated Halo2 proof verification
 */
interface IHalo2Verifier {
    function verifyProof(
        bytes calldata proof,
        uint256[] calldata instances
    ) external view returns (bool);
}
