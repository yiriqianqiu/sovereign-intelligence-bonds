// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IERC3475.sol";

contract MockAutoCompoundController {
    address public bondManager;
    uint256 public lastClassId;
    uint256 public lastAmount;
    uint256 public totalPurchased;

    constructor(address _bondManager) {
        bondManager = _bondManager;
    }

    function purchaseBondsBNB(uint256 classId, uint256 amount) external payable {
        lastClassId = classId;
        lastAmount = amount;
        totalPurchased += amount;

        // Issue bonds to the caller (the vault)
        IERC3475.Transaction[] memory txns = new IERC3475.Transaction[](1);
        txns[0] = IERC3475.Transaction({classId: classId, nonceId: 0, amount: amount});
        // We need the controller role on bondManager to issue, but for mock we just track
    }

    receive() external payable {}
}
