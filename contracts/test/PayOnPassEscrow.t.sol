// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PayOnPassEscrowBase} from "./PayOnPassEscrow.Base.t.sol";
import {PayOnPassEscrow} from "../PayOnPassEscrow.sol";

// ═══════════════════════════════════════════════════════════════════════════
// Tests 1-19: happy-path, reject, refund, role checks, status checks,
//             blocklist/pull-claim, balance invariant sequence
// ═══════════════════════════════════════════════════════════════════════════
contract PayOnPassEscrowTest is PayOnPassEscrowBase {

    // ───── 1. Happy path ─────────────────────────────────────────────────

    function test_HappyPath_CreateSubmitApprove() public {
        uint256 buyerBefore   = usdc.balanceOf(buyer);
        uint256 workerBefore  = usdc.balanceOf(worker);
        uint256 escrowBefore  = usdc.balanceOf(address(escrow));

        // createTask
        vm.prank(buyer);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit PayOnPassEscrow.TaskCreated(
            0, buyer, worker, checker,
            TASK_AMOUNT, uint64(block.timestamp + ONE_DAY), CRITERIA
        );
        uint256 taskId = escrow.createTask(
            worker, checker, TASK_AMOUNT,
            uint64(block.timestamp + ONE_DAY), CRITERIA
        );

        assertEq(usdc.balanceOf(buyer),           buyerBefore  - TASK_AMOUNT, "buyer debited");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + TASK_AMOUNT, "escrow credited");
        {
            PayOnPassEscrow.Task memory t = escrow.getTask(taskId);
            assertEq(uint8(t.status), uint8(PayOnPassEscrow.TaskStatus.Funded));
        }

        // submit
        vm.prank(worker);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.WorkSubmitted(taskId, worker, DELIVERABLE);
        escrow.submit(taskId, DELIVERABLE);

        {
            PayOnPassEscrow.Task memory t = escrow.getTask(taskId);
            assertEq(uint8(t.status), uint8(PayOnPassEscrow.TaskStatus.Submitted));
            assertEq(t.deliverableHash, DELIVERABLE);
        }

        // approve
        vm.prank(checker);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.TaskApproved(taskId, checker, VERDICT);
        escrow.approve(taskId, VERDICT);

        assertEq(usdc.balanceOf(worker),          workerBefore  + TASK_AMOUNT, "worker paid");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore,                "escrow drained");
        {
            PayOnPassEscrow.Task memory t = escrow.getTask(taskId);
            assertEq(uint8(t.status), uint8(PayOnPassEscrow.TaskStatus.Paid));
        }
    }

    // ───── 2. Reject from Funded ──────────────────────────────────────────

    function test_Reject_FromFunded() public {
        uint256 taskId      = _createTask();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(checker);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.TaskRejected(taskId, checker, VERDICT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.TaskRefunded(taskId, buyer, TASK_AMOUNT);
        escrow.reject(taskId, VERDICT);

        assertEq(usdc.balanceOf(buyer), buyerBefore + TASK_AMOUNT, "buyer refunded");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Refunded)
        );
    }

    // ───── 3. Reject from Submitted ───────────────────────────────────────

    function test_Reject_FromSubmitted() public {
        uint256 taskId      = _createAndSubmit();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.prank(checker);
        escrow.reject(taskId, VERDICT);

        assertEq(usdc.balanceOf(buyer), buyerBefore + TASK_AMOUNT, "buyer refunded");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Refunded)
        );
    }

    // ───── 4. RefundAfterDeadline, Funded ────────────────────────────────

    function test_RefundAfterDeadline_Funded() public {
        uint256 taskId      = _createTask();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.warp(block.timestamp + ONE_DAY); // exactly at deadline

        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.TaskRefunded(taskId, buyer, TASK_AMOUNT);
        escrow.refundAfterDeadline(taskId);

        assertEq(usdc.balanceOf(buyer), buyerBefore + TASK_AMOUNT, "buyer refunded");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Refunded)
        );
    }

    // ───── 5. RefundAfterDeadline, Submitted ─────────────────────────────

    function test_RefundAfterDeadline_Submitted() public {
        uint256 taskId      = _createAndSubmit();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.warp(block.timestamp + ONE_DAY);
        escrow.refundAfterDeadline(taskId);

        assertEq(usdc.balanceOf(buyer), buyerBefore + TASK_AMOUNT, "buyer refunded");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Refunded)
        );
    }

    // ───── 6. RefundAfterDeadline before deadline reverts ─────────────────

    function test_RefundAfterDeadline_BeforeDeadline_Reverts() public {
        uint256 taskId = _createTask();
        // still before deadline
        vm.expectRevert(bytes("deadline not reached"));
        escrow.refundAfterDeadline(taskId);
    }

    // ───── 7. Non-worker cannot submit ───────────────────────────────────

    function test_Submit_NotWorker_Reverts() public {
        uint256 taskId = _createTask();
        vm.prank(stranger);
        vm.expectRevert(bytes("not worker"));
        escrow.submit(taskId, DELIVERABLE);
    }

    // ───── 8. Non-checker cannot approve ─────────────────────────────────

    function test_Approve_NotChecker_Reverts() public {
        uint256 taskId = _createAndSubmit();
        vm.prank(stranger);
        vm.expectRevert(bytes("not checker"));
        escrow.approve(taskId, VERDICT);
    }

    // ───── 9. Non-checker cannot reject ──────────────────────────────────

    function test_Reject_NotChecker_Reverts() public {
        uint256 taskId = _createTask();
        vm.prank(stranger);
        vm.expectRevert(bytes("not checker"));
        escrow.reject(taskId, VERDICT);
    }

    // ───── 10. Worker cannot submit after deadline ────────────────────────

    function test_Submit_AfterDeadline_Reverts() public {
        uint256 taskId = _createTask();
        vm.warp(block.timestamp + ONE_DAY); // at deadline, not strictly before
        vm.prank(worker);
        vm.expectRevert(bytes("deadline passed"));
        escrow.submit(taskId, DELIVERABLE);
    }

    // ───── 11. Checker cannot approve while Funded ────────────────────────

    function test_Approve_BeforeSubmit_Reverts() public {
        uint256 taskId = _createTask();
        vm.prank(checker);
        vm.expectRevert(bytes("not submitted"));
        escrow.approve(taskId, VERDICT);
    }

    // ───── 12. Approve twice reverts ──────────────────────────────────────

    function test_Approve_DoublePayout_Reverts() public {
        uint256 taskId = _createSubmitApprove();
        vm.prank(checker);
        vm.expectRevert(bytes("not submitted"));
        escrow.approve(taskId, VERDICT);
    }

    // ───── 13. Reject on Paid task reverts ────────────────────────────────

    function test_Reject_AfterPaid_Reverts() public {
        uint256 taskId = _createSubmitApprove();
        vm.prank(checker);
        vm.expectRevert(bytes("invalid status"));
        escrow.reject(taskId, VERDICT);
    }

    // ───── 14. RefundAfterDeadline on Paid task reverts ───────────────────

    function test_RefundAfterDeadline_AfterPaid_Reverts() public {
        uint256 taskId = _createSubmitApprove();
        vm.warp(block.timestamp + ONE_DAY);
        vm.expectRevert(bytes("invalid status"));
        escrow.refundAfterDeadline(taskId);
    }

    // ───── 15. Approve, blocked worker gets credited ─────────────────────

    function test_Approve_BlockedWorker_Credits() public {
        uint256 taskId = _createAndSubmit();
        usdc.setBlocked(worker, true);

        vm.prank(checker);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit PayOnPassEscrow.PaymentCredited(worker, TASK_AMOUNT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.TaskApproved(taskId, checker, VERDICT);
        escrow.approve(taskId, VERDICT);

        assertEq(usdc.balanceOf(worker),  0,           "worker got no direct USDC");
        assertEq(escrow.claimable(worker), TASK_AMOUNT, "worker claimable credited");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Paid)
        );
    }

    // ───── 16. Reject, blocked buyer gets credited ───────────────────────

    function test_Reject_BlockedBuyer_Credits() public {
        uint256 taskId = _createTask();
        usdc.setBlocked(buyer, true);

        vm.prank(checker);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit PayOnPassEscrow.PaymentCredited(buyer, TASK_AMOUNT);
        escrow.reject(taskId, VERDICT);

        assertEq(escrow.claimable(buyer), TASK_AMOUNT, "buyer claimable credited");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Refunded)
        );
    }

    // ───── 17. RefundAfterDeadline, blocked buyer gets credited ──────────

    function test_RefundAfterDeadline_BlockedBuyer_Credits() public {
        uint256 taskId = _createTask();
        usdc.setBlocked(buyer, true);

        vm.warp(block.timestamp + ONE_DAY);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit PayOnPassEscrow.PaymentCredited(buyer, TASK_AMOUNT);
        escrow.refundAfterDeadline(taskId);

        assertEq(escrow.claimable(buyer), TASK_AMOUNT, "buyer claimable credited");
        assertEq(
            uint8(escrow.getTask(taskId).status),
            uint8(PayOnPassEscrow.TaskStatus.Refunded)
        );
    }

    // ───── 18. WithdrawTo routes to alt address after unblock ─────────────

    function test_WithdrawTo_UnblocksAfterBlock() public {
        address altAddress = makeAddr("alt");

        // Block worker so approve credits claimable.
        usdc.setBlocked(worker, true);
        uint256 taskId = _createAndSubmit();
        vm.prank(checker);
        escrow.approve(taskId, VERDICT);

        assertEq(escrow.claimable(worker), TASK_AMOUNT);

        // Unblock worker (simulates USDC blocklist removal); withdrawTo altAddress.
        usdc.setBlocked(worker, false);

        vm.prank(worker);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PayOnPassEscrow.Withdrawn(worker, altAddress, TASK_AMOUNT);
        escrow.withdrawTo(altAddress);

        assertEq(usdc.balanceOf(altAddress), TASK_AMOUNT, "alt received USDC");
        assertEq(escrow.claimable(worker),   0,           "claimable zeroed");
    }

    // ───── 19. Withdraw, double withdraw reverts ─────────────────────────

    function test_Withdraw_CannotDouble() public {
        usdc.setBlocked(worker, true);
        uint256 taskId = _createAndSubmit();
        vm.prank(checker);
        escrow.approve(taskId, VERDICT);

        // Unblock so first withdraw succeeds.
        usdc.setBlocked(worker, false);
        vm.prank(worker);
        escrow.withdraw();

        // Second withdraw, nothing to claim.
        vm.prank(worker);
        vm.expectRevert(bytes("nothing to claim"));
        escrow.withdraw();
    }

    // ───── 20. Balance invariant sequence ─────────────────────────────────

    function test_Invariant_EscrowBalance() public {
        // Helper: assert usdc.balanceOf(escrow) == sum of open tasks + sum of claimable.
        // We track manually here; no handler needed for a scripted sequence.

        // Give a second buyer for task 2.
        address buyer2 = makeAddr("buyer2");
        usdc.mint(buyer2, BUYER_MINT);
        vm.prank(buyer2);
        usdc.approve(address(escrow), type(uint256).max);

        // Give a third buyer for task 3.
        address buyer3 = makeAddr("buyer3");
        usdc.mint(buyer3, BUYER_MINT);
        vm.prank(buyer3);
        usdc.approve(address(escrow), type(uint256).max);

        address worker2  = makeAddr("worker2");
        address checker2 = makeAddr("checker2");
        address worker3  = makeAddr("worker3");
        address checker3 = makeAddr("checker3");

        // ── Step A: create 3 tasks ──────────────────────────────────────
        // Task 0: buyer / worker / checker, will be approved (worker paid directly)
        vm.prank(buyer);
        uint256 t0 = escrow.createTask(
            worker, checker, TASK_AMOUNT,
            _deadline(ONE_DAY), CRITERIA
        );
        _assertEscrowInvariant(TASK_AMOUNT, 0, "after task0 created");

        // Task 1: buyer2 / worker2 / checker2, will be rejected with buyer2 blocked
        vm.prank(buyer2);
        uint256 t1 = escrow.createTask(
            worker2, checker2, TASK_AMOUNT,
            _deadline(ONE_DAY), CRITERIA
        );
        _assertEscrowInvariant(2 * TASK_AMOUNT, 0, "after task1 created");

        // Task 2: buyer3 / worker3 / checker3, will be deadline-refunded with buyer3 blocked
        vm.prank(buyer3);
        uint256 t2 = escrow.createTask(
            worker3, checker3, TASK_AMOUNT,
            _deadline(ONE_DAY), CRITERIA
        );
        _assertEscrowInvariant(3 * TASK_AMOUNT, 0, "after task2 created");

        // ── Step B: submit+approve task 0 ─────────────────────────────
        vm.prank(worker);
        escrow.submit(t0, DELIVERABLE);
        vm.prank(checker);
        escrow.approve(t0, VERDICT);
        // task0 paid out directly to worker, 2 tasks still open
        _assertEscrowInvariant(2 * TASK_AMOUNT, 0, "after task0 approved");

        // ── Step C: reject task 1 with buyer2 blocked (credits) ────────
        usdc.setBlocked(buyer2, true);
        vm.prank(checker2);
        escrow.reject(t1, VERDICT);
        // task1 refunded → claimable[buyer2] = TASK_AMOUNT, 1 open task
        _assertEscrowInvariant(TASK_AMOUNT, TASK_AMOUNT, "after task1 rejected+credited");

        // ── Step D: deadline-refund task 2 with buyer3 blocked ─────────
        usdc.setBlocked(buyer3, true);
        vm.warp(block.timestamp + ONE_DAY);
        escrow.refundAfterDeadline(t2);
        // task2 refunded → claimable[buyer3] = TASK_AMOUNT, 0 open tasks
        _assertEscrowInvariant(0, 2 * TASK_AMOUNT, "after task2 deadline-refunded+credited");
    }

    /// @dev Assert: usdc.balanceOf(escrow) == openTasksSum + claimableSum.
    function _assertEscrowInvariant(
        uint256 openTasksSum,
        uint256 claimableSum,
        string memory label
    ) internal view {
        assertEq(
            usdc.balanceOf(address(escrow)),
            openTasksSum + claimableSum,
            label
        );
    }

    // ───── 21-26. createTask validations ─────────────────────────────────

    function test_CreateTask_ZeroAmount_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert(bytes("amount is zero"));
        escrow.createTask(worker, checker, 0, _deadline(ONE_DAY), CRITERIA);
    }

    function test_CreateTask_ZeroWorker_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert(bytes("worker is zero"));
        escrow.createTask(address(0), checker, TASK_AMOUNT, _deadline(ONE_DAY), CRITERIA);
    }

    function test_CreateTask_ZeroChecker_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert(bytes("checker is zero"));
        escrow.createTask(worker, address(0), TASK_AMOUNT, _deadline(ONE_DAY), CRITERIA);
    }

    function test_CreateTask_WorkerEqualsChecker_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert(bytes("worker == checker"));
        escrow.createTask(worker, worker, TASK_AMOUNT, _deadline(ONE_DAY), CRITERIA);
    }

    function test_CreateTask_BuyerEqualsWorker_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert(bytes("buyer == worker"));
        escrow.createTask(buyer, checker, TASK_AMOUNT, _deadline(ONE_DAY), CRITERIA);
    }

    function test_CreateTask_DeadlineInPast_Reverts() public {
        vm.prank(buyer);
        vm.expectRevert(bytes("deadline not future"));
        escrow.createTask(worker, checker, TASK_AMOUNT, uint64(block.timestamp), CRITERIA);
    }
}
