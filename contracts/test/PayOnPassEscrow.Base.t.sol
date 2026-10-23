// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PayOnPassEscrow} from "../PayOnPassEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/**
 * @dev Shared fixtures for all PayOnPassEscrow test categories.
 *      No test/fuzz/invariant functions here, each category inherits and runs setUp().
 */
abstract contract PayOnPassEscrowBase is Test {

    // ── actors ─────────────────────────────────────────────────────────
    address internal buyer   = makeAddr("buyer");
    address internal worker  = makeAddr("worker");
    address internal checker = makeAddr("checker");
    address internal stranger = makeAddr("stranger");

    // ── constants ──────────────────────────────────────────────────────
    uint256 internal constant TASK_AMOUNT  = 100e6;   // 100 USDC (6 dec)
    uint256 internal constant BUYER_MINT   = 10_000e6;
    uint64  internal constant ONE_DAY      = 1 days;
    bytes32 internal constant CRITERIA     = keccak256("do the thing");
    bytes32 internal constant DELIVERABLE  = keccak256("here it is");
    bytes32 internal constant VERDICT      = keccak256("looks good");

    // ── contracts ──────────────────────────────────────────────────────
    MockERC20        internal usdc;
    PayOnPassEscrow  internal escrow;

    // ── setUp ──────────────────────────────────────────────────────────
    function setUp() public virtual {
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new PayOnPassEscrow(address(usdc));

        // Seed buyer with USDC and pre-approve escrow for unlimited spend.
        usdc.mint(buyer, BUYER_MINT);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── helpers ────────────────────────────────────────────────────────

    /// @dev Create a task from buyer with a deadline `ONE_DAY` in the future.
    function _createTask() internal returns (uint256 taskId) {
        vm.prank(buyer);
        taskId = escrow.createTask(
            worker,
            checker,
            TASK_AMOUNT,
            uint64(block.timestamp + ONE_DAY),
            CRITERIA
        );
    }

    /// @dev Create task and have worker submit.
    function _createAndSubmit() internal returns (uint256 taskId) {
        taskId = _createTask();
        vm.prank(worker);
        escrow.submit(taskId, DELIVERABLE);
    }

    /// @dev Create, submit, and have checker approve.
    function _createSubmitApprove() internal returns (uint256 taskId) {
        taskId = _createAndSubmit();
        vm.prank(checker);
        escrow.approve(taskId, VERDICT);
    }

    /// @dev Return a future deadline `delta` seconds from now.
    function _deadline(uint64 delta) internal view returns (uint64) {
        return uint64(block.timestamp + delta);
    }
}
