// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QDayRadar} from "../src/QDayRadar.sol";

/// Stand-in for QoreChain's 0x0A02 precompile in Foundry's local EVM.
contract MockPQC {
    mapping(address => bool) public reg;

    function set(address a, bool r) external {
        reg[a] = r;
    }

    function pqcKeyStatus(address a) external view returns (bool, uint8, bytes memory) {
        return (reg[a], reg[a] ? 87 : 0, reg[a] ? bytes("mldsa87-pubkey") : bytes(""));
    }
}

contract QDayRadarTest is Test {
    QDayRadar radar;
    MockPQC pqc;
    address attester = makeAddr("attester");
    address pqUser = makeAddr("pqUser");
    uint256 legacyKey = 0xA11CE;
    address legacy;

    function setUp() public {
        vm.etch(address(0x0A02), type(MockPQC).runtimeCode);
        pqc = MockPQC(address(0x0A02));
        radar = new QDayRadar();
        radar.setAttester(attester, true);
        pqc.set(attester, true);
        pqc.set(pqUser, true);
        legacy = vm.addr(legacyKey);
    }

    function _sig(uint256 key, address leg, address pq) internal view returns (bytes memory) {
        bytes32 m = radar.migrationMessage(leg, pq);
        bytes32 d = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", m));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function test_attestScan_records() public {
        vm.prank(attester);
        radar.attestScan(legacy, 0x7f, 0x05, 2, keccak256("evidence"));
        (uint32 chains, uint32 exposed, uint8 risk,,, address by) = radar.scans(legacy);
        assertEq(chains, 0x7f);
        assertEq(exposed, 0x05);
        assertEq(risk, 2);
        assertEq(by, attester);
        assertEq(radar.scanCount(), 1);
    }

    function test_rescan_doesNotDoubleCount() public {
        vm.startPrank(attester);
        radar.attestScan(legacy, 1, 1, 1, bytes32(0));
        radar.attestScan(legacy, 3, 1, 2, bytes32(0));
        vm.stopPrank();
        assertEq(radar.scanCount(), 1);
    }

    function test_attestScan_onlyAttester() public {
        vm.expectRevert(QDayRadar.NotAttester.selector);
        radar.attestScan(legacy, 1, 1, 1, bytes32(0));
    }

    function test_attestScan_failsClosedWithoutPqcKey() public {
        pqc.set(attester, false);
        vm.prank(attester);
        vm.expectRevert(abi.encodeWithSelector(QDayRadar.NoPqcKey.selector, attester));
        radar.attestScan(legacy, 1, 1, 1, bytes32(0));
    }

    function test_attestScan_rejectsInconsistentMask() public {
        vm.prank(attester);
        vm.expectRevert(QDayRadar.BadRisk.selector);
        radar.attestScan(legacy, 0x01, 0x02, 1, bytes32(0));
    }

    function test_linkSuccessor_hybridProof() public {
        bytes memory sig = _sig(legacyKey, legacy, pqUser);
        vm.prank(pqUser);
        radar.linkSuccessor(legacy, sig);
        (address pq, uint8 alg,) = radar.successors(legacy);
        assertEq(pq, pqUser);
        assertEq(alg, 87);
        (,,, address s, bool prot) = radar.status(legacy);
        assertEq(s, pqUser);
        assertTrue(prot);
    }

    function test_linkSuccessor_needsLegacySignature() public {
        bytes memory sig = _sig(0xBADBAD, legacy, pqUser);
        vm.prank(pqUser);
        vm.expectRevert(QDayRadar.BadLegacySignature.selector);
        radar.linkSuccessor(legacy, sig);
    }

    function test_linkSuccessor_signatureBoundToCaller() public {
        address other = makeAddr("other");
        pqc.set(other, true);
        bytes memory sig = _sig(legacyKey, legacy, pqUser); // signed for pqUser
        vm.prank(other);
        vm.expectRevert(QDayRadar.BadLegacySignature.selector);
        radar.linkSuccessor(legacy, sig);
    }

    function test_linkSuccessor_needsPqcKey() public {
        address classic = makeAddr("classic");
        bytes memory sig = _sig(legacyKey, legacy, classic);
        vm.prank(classic);
        vm.expectRevert(abi.encodeWithSelector(QDayRadar.NoPqcKey.selector, classic));
        radar.linkSuccessor(legacy, sig);
    }

    function test_linkSuccessor_once() public {
        bytes memory sig = _sig(legacyKey, legacy, pqUser);
        vm.startPrank(pqUser);
        radar.linkSuccessor(legacy, sig);
        vm.expectRevert(QDayRadar.AlreadyLinked.selector);
        radar.linkSuccessor(legacy, sig);
        vm.stopPrank();
    }

    function test_status_reportsKeyRevocation() public {
        bytes memory sig = _sig(legacyKey, legacy, pqUser);
        vm.prank(pqUser);
        radar.linkSuccessor(legacy, sig);
        pqc.set(pqUser, false);
        (,,,, bool prot) = radar.status(legacy);
        assertFalse(prot);
    }

    function test_onlyOwnerSetsAttesters() public {
        vm.prank(attester);
        vm.expectRevert(QDayRadar.NotOwner.selector);
        radar.setAttester(attester, false);
    }
}
