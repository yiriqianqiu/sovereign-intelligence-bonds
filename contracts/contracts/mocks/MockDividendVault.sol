// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockDividendVault {
    // claimable amounts: holder => classId => nonceId => token => amount
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => uint256)))) private _claimable;

    // Track claim calls
    uint256 public claimCallCount;
    uint256 public lastClaimClassId;
    uint256 public lastClaimNonceId;

    function setClaimable(address holder, uint256 classId, uint256 nonceId, address token, uint256 amount) external {
        _claimable[holder][classId][nonceId][token] = amount;
    }

    function claimable(address holder, uint256 classId, uint256 nonceId, address token) external view returns (uint256) {
        return _claimable[holder][classId][nonceId][token];
    }

    function claim(uint256 classId, uint256 nonceId, address token) external {
        uint256 amount = _claimable[msg.sender][classId][nonceId][token];
        if (amount > 0) {
            _claimable[msg.sender][classId][nonceId][token] = 0;
            // Send BNB to caller if token is address(0)
            if (token == address(0) && amount > 0) {
                (bool sent, ) = payable(msg.sender).call{value: amount}("");
                require(sent, "MockDividendVault: BNB transfer failed");
            }
        }
        claimCallCount++;
        lastClaimClassId = classId;
        lastClaimNonceId = nonceId;
    }

    receive() external payable {}
}
