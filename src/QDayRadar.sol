// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// QoreChain post-quantum precompile (active on testnet qorechain-diana at 0x0A02).
interface IQorePQC {
    function pqcKeyStatus(address account) external view returns (bool registered, uint8 algorithmId, bytes memory pubkey);
}

/// @title QDayRadar
/// @notice Public registry of "quantum exposure" for classical EVM wallets, and of their
///         post-quantum successors on QoreChain.
///
/// A classical address is *quantum-exposed* once it has sent a transaction on any chain:
/// its secp256k1 public key can then be recovered from the signature, and a large enough
/// quantum computer could derive the private key ("harvest now, forge later").
///
/// 1. Scanner attesters (who must themselves hold a registered ML-DSA key, checked through
///    the PQC precompile) record a scan: which of the checked chains expose the key.
/// 2. The owner of an exposed wallet links it to a QoreChain account that has a registered
///    ML-DSA-87 key. The link needs BOTH an ECDSA signature from the legacy key and a call
///    from the PQC-protected account, so it is a hybrid proof of succession.
contract QDayRadar {
    IQorePQC public constant PQC = IQorePQC(0x0000000000000000000000000000000000000a02);

    struct Scan {
        uint32 chainsScanned; // bitmask of chains that were checked
        uint32 exposedMask; // bitmask of chains where the address has sent a tx (pubkey public)
        uint8 risk; // 0 = clean, 1 = exposed/empty, 2 = exposed/with funds, 3 = exposed/high value
        uint64 scannedAt;
        bytes32 evidenceHash; // keccak256 of the JSON evidence served by the scanner API
        address attester;
    }

    struct Successor {
        address pqAccount; // QoreChain account with a registered ML-DSA key
        uint8 algorithmId; // as reported by the precompile at link time
        uint64 linkedAt;
    }

    address public owner;
    mapping(address => bool) public attesters;
    mapping(address => Scan) public scans;
    mapping(address => Successor) public successors;
    uint256 public scanCount;
    uint256 public migrationCount;

    event AttesterSet(address indexed attester, bool allowed);
    event Scanned(address indexed subject, uint32 exposedMask, uint8 risk, bytes32 evidenceHash, address indexed attester);
    event Migrated(address indexed legacy, address indexed pqAccount, uint8 algorithmId);

    error NotOwner();
    error NotAttester();
    error NoPqcKey(address account);
    error BadRisk();
    error BadLegacySignature();
    error AlreadyLinked();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setAttester(address a, bool allowed) external onlyOwner {
        attesters[a] = allowed;
        emit AttesterSet(a, allowed);
    }

    /// @dev Fails closed: an account without a registered post-quantum key is refused.
    function _requirePqc(address account) internal view returns (uint8 algorithmId) {
        (bool registered, uint8 alg,) = PQC.pqcKeyStatus(account);
        if (!registered) revert NoPqcKey(account);
        return alg;
    }

    function attestScan(address subject, uint32 chainsScanned, uint32 exposedMask, uint8 risk, bytes32 evidenceHash)
        external
    {
        if (!attesters[msg.sender]) revert NotAttester();
        _requirePqc(msg.sender);
        if (risk > 3) revert BadRisk();
        if (exposedMask & ~chainsScanned != 0) revert BadRisk();
        if (scans[subject].scannedAt == 0) scanCount++;
        scans[subject] = Scan(chainsScanned, exposedMask, risk, uint64(block.timestamp), evidenceHash, msg.sender);
        emit Scanned(subject, exposedMask, risk, evidenceHash, msg.sender);
    }

    /// @notice Message the legacy (classical) key signs, EIP-191 personal_sign format.
    function migrationMessage(address legacy, address pqAccount) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked("QDayRadar: I move ", legacy, " to post-quantum account ", pqAccount, " on chain ", block.chainid)
        );
    }

    /// @notice Called by the PQC-protected QoreChain account (e.g. from QoreX).
    /// @param legacy  the exposed classical address
    /// @param sig     65-byte personal_sign signature of migrationMessage(legacy, msg.sender) by `legacy`
    function linkSuccessor(address legacy, bytes calldata sig) external {
        if (successors[legacy].pqAccount != address(0)) revert AlreadyLinked();
        uint8 alg = _requirePqc(msg.sender);
        bytes32 digest =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", migrationMessage(legacy, msg.sender)));
        if (_recover(digest, sig) != legacy) revert BadLegacySignature();
        successors[legacy] = Successor(msg.sender, alg, uint64(block.timestamp));
        migrationCount++;
        emit Migrated(legacy, msg.sender, alg);
    }

    /// @notice One-call summary for wallets, explorers and the Telegram bot.
    function status(address subject)
        external
        view
        returns (bool scanned, uint32 exposedMask, uint8 risk, address pqAccount, bool successorStillProtected)
    {
        Scan memory s = scans[subject];
        Successor memory m = successors[subject];
        bool prot;
        if (m.pqAccount != address(0)) {
            (prot,,) = PQC.pqcKeyStatus(m.pqAccount);
        }
        return (s.scannedAt != 0, s.exposedMask, s.risk, m.pqAccount, prot);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        // reject malleable signatures (EIP-2)
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
