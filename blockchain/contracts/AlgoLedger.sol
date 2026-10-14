// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AlgoLedger — tamper-evident audit trail for AlgoLearn
/// @notice Stores only fingerprints (SHA-256 hashes) of strategies, backtests,
///         signal batches and simulator results. The content itself stays off-chain;
///         anyone holding it can recompute the hash and compare with this ledger.
///         Records are write-once: there is no update or delete.
contract AlgoLedger {
    enum Kind { Strategy, Backtest, SignalBatch, SimulationResult, LiveSignal }

    struct Record {
        bytes32 contentHash; // sha256 of the canonical JSON content
        bytes32 subject;     // pseudonymous user id (sha256(salt:uid)), 0 = anonymous
        bytes32 parent;      // e.g. the strategy a backtest ran, 0 = none
        uint8 kind;
        uint64 timestamp;
        uint64 blockNumber;
        address writer;
    }

    address public owner;
    mapping(address => bool) public writers;
    mapping(bytes32 => Record) private records;
    uint256 public recordCount;

    event Recorded(bytes32 indexed id, uint8 indexed kind, bytes32 indexed subject, bytes32 contentHash, bytes32 parent);
    event WriterChanged(address indexed writer, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotWriter();
    error AlreadyRecorded(bytes32 id);
    error InvalidRecord();
    error UnknownParent(bytes32 parent);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyWriter() {
        if (!writers[msg.sender]) revert NotWriter();
        _;
    }

    constructor() {
        owner = msg.sender;
        writers[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit WriterChanged(msg.sender, true);
    }

    function setWriter(address writer, bool allowed) external onlyOwner {
        writers[writer] = allowed;
        emit WriterChanged(writer, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidRecord();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function record(bytes32 id, uint8 kind, bytes32 contentHash, bytes32 subject, bytes32 parent)
        external
        onlyWriter
    {
        if (id == bytes32(0) || contentHash == bytes32(0) || kind > uint8(Kind.LiveSignal)) revert InvalidRecord();
        if (records[id].timestamp != 0) revert AlreadyRecorded(id);
        if (parent != bytes32(0) && records[parent].timestamp == 0) revert UnknownParent(parent);

        records[id] = Record({
            contentHash: contentHash,
            subject: subject,
            parent: parent,
            kind: kind,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            writer: msg.sender
        });
        unchecked { recordCount++; }
        emit Recorded(id, kind, subject, contentHash, parent);
    }

    function exists(bytes32 id) external view returns (bool) {
        return records[id].timestamp != 0;
    }

    function get(bytes32 id) external view returns (Record memory) {
        return records[id];
    }

    /// @return true if `id` exists and was recorded with exactly `contentHash`
    function verify(bytes32 id, bytes32 contentHash) external view returns (bool) {
        return records[id].timestamp != 0 && records[id].contentHash == contentHash;
    }
}
