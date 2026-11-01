// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ProofRegistry} from "../ProofRegistry.sol";

// Minimal cheatcode interface, so the test compiles without forge-std or git submodules.
interface Vm {
    function prank(address sender) external;
    function etch(address target, bytes calldata code) external;
    function expectRevert(bytes4 selector) external;
    function expectEmit(bool t1, bool t2, bool t3, bool data, address emitter) external;
}

contract ProofRegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address constant ATTESTER = address(0xA11CE);
    address constant STRANGER = address(0xBAD);
    address constant TARGET = address(0xC0DE);
    address constant OTHER = address(0xD00D);

    bytes constant CODE_A = hex"600160005260206000f3";
    bytes constant CODE_B = hex"602a60005260206000f3";

    bytes32 constant SOURCE = keccak256("source");
    bytes20 constant COMMIT = bytes20(keccak256("commit"));
    string constant REPO = "owner/name";

    event ProofRecorded(address indexed target, bytes32 runtimeHash, bytes32 sourceHash, bytes20 commit, string repo);

    ProofRegistry registry;

    function setUp() public {
        registry = new ProofRegistry(ATTESTER);
        vm.etch(TARGET, CODE_A);
        vm.etch(OTHER, CODE_B);
    }

    function test_SuccessRecordsAndEmits() public {
        bytes32 h = TARGET.codehash;
        vm.expectEmit(true, true, true, true, address(registry));
        emit ProofRecorded(TARGET, h, SOURCE, COMMIT, REPO);
        vm.prank(ATTESTER);
        registry.record(TARGET, h, SOURCE, COMMIT, REPO);
        require(registry.recordedRuntimeHash(TARGET) == h, "not stored");
    }

    function test_NonAttesterReverts() public {
        bytes32 h = TARGET.codehash;
        vm.expectRevert(ProofRegistry.NotAttester.selector);
        vm.prank(STRANGER);
        registry.record(TARGET, h, SOURCE, COMMIT, REPO);
    }

    function test_WrongHashReverts() public {
        vm.expectRevert(ProofRegistry.CodeMismatch.selector);
        vm.prank(ATTESTER);
        registry.record(TARGET, keccak256("not the code"), SOURCE, COMMIT, REPO);
    }

    function test_HashOfDifferentContractReverts() public {
        bytes32 otherHash = OTHER.codehash;
        vm.expectRevert(ProofRegistry.CodeMismatch.selector);
        vm.prank(ATTESTER);
        registry.record(TARGET, otherHash, SOURCE, COMMIT, REPO);
    }

    function test_EmptyAddressReverts() public {
        vm.expectRevert(ProofRegistry.CodeMismatch.selector);
        vm.prank(ATTESTER);
        registry.record(address(0), keccak256(""), SOURCE, COMMIT, REPO);
    }

    function test_FundedWalletWithEmptyHashReverts() public {
        // A funded account with no code has codehash keccak256(""), which is not a contract.
        address wallet = tx.origin;
        require(wallet.code.length == 0 && wallet.codehash == keccak256(""), "needs a funded wallet");
        vm.expectRevert(ProofRegistry.CodeMismatch.selector);
        vm.prank(ATTESTER);
        registry.record(wallet, keccak256(""), SOURCE, COMMIT, REPO);
    }

    function test_ZeroHashReverts() public {
        vm.expectRevert(ProofRegistry.CodeMismatch.selector);
        vm.prank(ATTESTER);
        registry.record(TARGET, bytes32(0), SOURCE, COMMIT, REPO);
    }

    function test_ReRecordingUpdates() public {
        vm.prank(ATTESTER);
        registry.record(TARGET, TARGET.codehash, SOURCE, COMMIT, REPO);

        vm.etch(TARGET, CODE_B);
        bytes32 newHash = TARGET.codehash;
        vm.prank(ATTESTER);
        registry.record(TARGET, newHash, keccak256("source 2"), COMMIT, "owner/name2");

        require(registry.recordedRuntimeHash(TARGET) == newHash, "not updated");
    }
}
