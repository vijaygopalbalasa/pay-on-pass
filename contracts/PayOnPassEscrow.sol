// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PayOnPassEscrow
 * @notice USDC task escrow: buyer funds → worker submits → checker approves or rejects.
 *
 * Normal flow: push payment lands in one step.
 * Blocklisted recipient: push silently credits a claimable balance instead of reverting.
 *   The recipient (or anyone they trust) calls withdrawTo(theirAlt) to recover funds.
 *
 * Invariant: usdc.balanceOf(this) == Σ open-task amounts + Σ claimable balances.
 * No owner. No admin. No fees. No upgradeability.
 */
contract PayOnPassEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────────── types ─────────────────────────────

    enum TaskStatus {
        Funded,
        Submitted,
        Paid,
        Refunded
    }

    struct Task {
        address buyer;
        address worker;
        address checker;
        uint256 amount;
        uint64  deadline;       // unix timestamp
        bytes32 criteriaHash;   // keccak256 of the acceptance criteria text
        bytes32 deliverableHash;// keccak256 of the deliverable; zero until submitted
        TaskStatus status;
    }

    // ───────────────────────────── state ─────────────────────────────

    IERC20 public immutable usdc;

    mapping(uint256 => Task)    public tasks;
    uint256                     public taskCount;

    /// @notice Claimable USDC for addresses whose direct transfer was blocked.
    mapping(address => uint256) private _claimable;

    // ───────────────────────────── events ────────────────────────────

    event TaskCreated(
        uint256 indexed taskId,
        address indexed buyer,
        address indexed worker,
        address         checker,
        uint256         amount,
        uint64          deadline,
        bytes32         criteriaHash
    );
    event WorkSubmitted(
        uint256 indexed taskId,
        address indexed worker,
        bytes32         deliverableHash
    );
    event TaskApproved(
        uint256 indexed taskId,
        address indexed checker,
        bytes32         verdictHash
    );
    event TaskRejected(
        uint256 indexed taskId,
        address indexed checker,
        bytes32         verdictHash
    );
    event TaskRefunded(
        uint256 indexed taskId,
        address indexed buyer,
        uint256         amount
    );
    /// @notice Emitted when a push transfer fails and the amount is credited instead.
    event PaymentCredited(address indexed recipient, uint256 amount);
    /// @notice Emitted when a recipient withdraws their claimable balance.
    event Withdrawn(address indexed recipient, address indexed to, uint256 amount);

    // ──────────────────────────── constructor ────────────────────────

    constructor(address usdcToken) {
        require(usdcToken != address(0), "usdcToken is zero");
        usdc = IERC20(usdcToken);
    }

    // ──────────────────────────── core escrow ────────────────────────

    /**
     * @notice Create a new task. Caller becomes the buyer.
     *         Pulls `amount` USDC from msg.sender into escrow.
     */
    function createTask(
        address worker,
        address checker,
        uint256 amount,
        uint64  deadline,
        bytes32 criteriaHash
    ) external returns (uint256 taskId) {
        require(amount > 0,                  "amount is zero");
        require(worker  != address(0),       "worker is zero");
        require(checker != address(0),       "checker is zero");
        require(worker  != checker,          "worker == checker");
        require(msg.sender != worker,        "buyer == worker");
        require(deadline > block.timestamp,  "deadline not future");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        taskId = taskCount++;
        tasks[taskId] = Task({
            buyer:           msg.sender,
            worker:          worker,
            checker:         checker,
            amount:          amount,
            deadline:        deadline,
            criteriaHash:    criteriaHash,
            deliverableHash: bytes32(0),
            status:          TaskStatus.Funded
        });

        emit TaskCreated(taskId, msg.sender, worker, checker, amount, deadline, criteriaHash);
    }

    /**
     * @notice Worker submits a deliverable hash. Must be before the deadline.
     */
    function submit(uint256 taskId, bytes32 deliverableHash) external {
        require(taskId < taskCount, "invalid taskId");

        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Funded, "not funded");
        require(block.timestamp < task.deadline,  "deadline passed");
        require(msg.sender == task.worker,        "not worker");

        task.deliverableHash = deliverableHash;
        task.status          = TaskStatus.Submitted;

        emit WorkSubmitted(taskId, msg.sender, deliverableHash);
    }

    /**
     * @notice Checker approves the work; pays the worker.
     *         If the direct transfer reverts (e.g. blocklist), credits the worker's
     *         claimable balance instead of reverting.
     */
    function approve(uint256 taskId, bytes32 verdictHash) external nonReentrant {
        require(taskId < taskCount, "invalid taskId");

        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Submitted, "not submitted");
        require(msg.sender  == task.checker,         "not checker");

        task.status = TaskStatus.Paid;

        _pushOrCredit(task.worker, task.amount);

        emit TaskApproved(taskId, msg.sender, verdictHash);
    }

    /**
     * @notice Checker rejects the work; refunds the buyer.
     *         Works from Funded or Submitted state.
     *         If the direct transfer reverts, credits the buyer's claimable balance.
     */
    function reject(uint256 taskId, bytes32 verdictHash) external nonReentrant {
        require(taskId < taskCount, "invalid taskId");

        Task storage task = tasks[taskId];
        require(
            task.status == TaskStatus.Funded || task.status == TaskStatus.Submitted,
            "invalid status"
        );
        require(msg.sender == task.checker, "not checker");

        address buyer  = task.buyer;
        uint256 amount = task.amount;

        task.status = TaskStatus.Refunded;

        _pushOrCredit(buyer, amount);

        emit TaskRejected(taskId, msg.sender, verdictHash);
        emit TaskRefunded(taskId, buyer, amount);
    }

    /**
     * @notice Anyone may trigger a refund to the buyer once the deadline has passed.
     *         Works from Funded or Submitted state.
     *         If the direct transfer reverts, credits the buyer's claimable balance.
     */
    function refundAfterDeadline(uint256 taskId) external nonReentrant {
        require(taskId < taskCount, "invalid taskId");

        Task storage task = tasks[taskId];
        require(block.timestamp >= task.deadline, "deadline not reached");
        require(
            task.status == TaskStatus.Funded || task.status == TaskStatus.Submitted,
            "invalid status"
        );

        address buyer  = task.buyer;
        uint256 amount = task.amount;

        task.status = TaskStatus.Refunded;

        _pushOrCredit(buyer, amount);

        emit TaskRefunded(taskId, buyer, amount);
    }

    // ──────────────────────── pull-claim interface ───────────────────

    /**
     * @notice Return the claimable USDC balance for `recipient`.
     */
    function claimable(address recipient) external view returns (uint256) {
        return _claimable[recipient];
    }

    /**
     * @notice Withdraw the full claimable balance of msg.sender to their own address.
     */
    function withdraw() external nonReentrant {
        _withdrawTo(msg.sender, msg.sender);
    }

    /**
     * @notice Withdraw the full claimable balance of msg.sender to `to`.
     *         Useful when msg.sender's own address is blocklisted.
     */
    function withdrawTo(address to) external nonReentrant {
        require(to != address(0), "to is zero");
        _withdrawTo(msg.sender, to);
    }

    // ──────────────────────────── views ──────────────────────────────

    /**
     * @notice Return the full Task struct for `taskId`.
     */
    function getTask(uint256 taskId) external view returns (Task memory) {
        require(taskId < taskCount, "invalid taskId");
        return tasks[taskId];
    }

    // ──────────────────────────── internals ──────────────────────────

    /**
     * @dev Try to push USDC to `recipient`. If the transfer reverts or returns false,
     *      credit the amount to the recipient's claimable balance instead.
     *      Status change MUST be applied before this call to prevent reentrancy.
     */
    function _pushOrCredit(address recipient, uint256 amount) private {
        // Low-level call: encode the ERC-20 transfer selector manually so we can
        // inspect the return value and catch reverts without bubbling them up.
        (bool ok, bytes memory data) = address(usdc).call(
            abi.encodeWithSelector(IERC20.transfer.selector, recipient, amount)
        );

        // A successful transfer either returns true or returns nothing (some tokens).
        bool transferred = ok && (data.length == 0 || abi.decode(data, (bool)));

        if (!transferred) {
            // Push failed, credit so the escrow balance invariant is preserved.
            _claimable[recipient] += amount;
            emit PaymentCredited(recipient, amount);
        }
    }

    /**
     * @dev Drain `from`'s claimable balance and safeTransfer it to `to`.
     */
    function _withdrawTo(address from, address to) private {
        uint256 amount = _claimable[from];
        require(amount > 0, "nothing to claim");
        _claimable[from] = 0;
        usdc.safeTransfer(to, amount);
        emit Withdrawn(from, to, amount);
    }
}
