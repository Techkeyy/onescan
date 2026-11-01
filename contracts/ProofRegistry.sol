// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Records that a deployed contract's runtime code matches a verified repo commit.
/// The hash check is the hard guarantee: a record can only point at code that is live.
contract ProofRegistry {
    error NotAttester();
    error CodeMismatch();

    address public immutable attester;

    mapping(address => bytes32) public recordedRuntimeHash;

    event ProofRecorded(
        address indexed target,
        bytes32 runtimeHash,
        bytes32 sourceHash,
        bytes20 commit,
        string repo
    );

    constructor(address _attester) {
        attester = _attester;
    }

    function record(
        address target,
        bytes32 runtimeHash,
        bytes32 sourceHash,
        bytes20 commit,
        string calldata repo
    ) external {
        if (msg.sender != attester) revert NotAttester();
        // Accounts with no code never qualify, whether missing or a funded wallet.
        if (runtimeHash == bytes32(0) || target.code.length == 0 || target.codehash != runtimeHash) revert CodeMismatch();
        recordedRuntimeHash[target] = runtimeHash;
        emit ProofRecorded(target, runtimeHash, sourceHash, commit, repo);
    }
}
