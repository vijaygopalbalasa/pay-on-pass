import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { Loader2, ExternalLink, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { ESCROW_CONTRACT, ESCROW_CONFIG, buildTxUrl, buildAddressUrl } from '@/escrow-config'
import { TaskData } from '@/hooks/useTasks'
import {
  formatAddr, formatUsdc, hashText, STATUS_LABEL, STATUS_COLOR,
  formatDeadline, isExpired,
} from '@/lib/utils'
import { toast } from 'sonner'

const glass = {
  card: {
    background: 'var(--surface-strong)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid var(--border)',
    borderRadius: '1.25rem',
  },
  inner: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    borderRadius: '0.875rem',
  },
}

// ── Standalone helper components (declared outside renders) ──────────

function StatusBadge({ status }: { status: number }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: `${STATUS_COLOR[status]}18`, color: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function HashRow({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-xs font-semibold min-w-[5.5rem]" style={{ color: 'var(--muted)' }}>{label}:</span>
      <span className="mono text-xs break-all" style={{ color: 'var(--subtle)' }}>{hash}</span>
    </div>
  )
}

function ActionBtn({ label, icon, color, disabled, onClick, pending }: {
  label: string; icon: React.ReactNode; color: string; disabled: boolean; onClick: () => void; pending: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: color }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      {pending ? 'Confirming…' : label}
    </button>
  )
}

function SwitchBtn({ isSwitching, switchChain }: { isSwitching: boolean; switchChain: () => void }) {
  return (
    <button
      onClick={switchChain}
      disabled={isSwitching}
      className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      style={{ background: 'var(--danger)' }}
    >
      {isSwitching ? 'Switching…' : `Switch to ${ESCROW_CONFIG.name}`}
    </button>
  )
}

// ── Main card ────────────────────────────────────────────────────────

interface Props { task: TaskData; onAction: () => void }

export function TaskCard({ task, onAction }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const [deliverable, setDeliverable] = useState('')
  const [verdictNote, setVerdictNote]  = useState('')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const onWrongChain = !!chainId && chainId !== ESCROW_CONFIG.chainId
  const doSwitch = () => switchChain({ chainId: ESCROW_CONFIG.chainId })

  const isWorker  = address?.toLowerCase() === task.worker.toLowerCase()
  const isChecker = address?.toLowerCase() === task.checker.toLowerCase()

  const expired = isExpired(task.deadline)
  const status  = task.status  // 0=Funded 1=Submitted 2=Paid 3=Refunded
  const isOpen  = status === 0 || status === 1

  function send(fn: string, args: unknown[]) {
    writeContract({
      address: ESCROW_CONTRACT.address,
      abi: ESCROW_CONTRACT.abi,
      functionName: fn,
      args,
      chainId: ESCROW_CONFIG.chainId,
    }, {
      onSuccess() { toast.success('Transaction confirmed'); onAction() },
      onError(e)  { toast.error(e.message?.split('\n')[0] ?? 'Transaction failed') },
    })
  }

  function handleSubmit() {
    if (!deliverable.trim()) return
    send('submit', [task.taskId, hashText(deliverable)])
  }

  function handleApprove() {
    send('approve', [task.taskId, verdictNote.trim() ? hashText(verdictNote) : hashText('approved')])
  }

  function handleReject() {
    send('reject', [task.taskId, verdictNote.trim() ? hashText(verdictNote) : hashText('rejected')])
  }

  function handleRefund() {
    send('refundAfterDeadline', [task.taskId])
  }

  const actionDisabled = !address || isPending || isConfirming

  return (
    <div style={glass.card} className="overflow-hidden">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <span className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
            Task #{task.taskId.toString()}
          </span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {formatUsdc(task.amount)}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Parties */}
      <div className="px-5 pb-3 grid grid-cols-3 gap-2">
        {(['buyer', 'worker', 'checker'] as const).map(role => (
          <div key={role} style={glass.inner} className="px-2.5 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{role}</div>
            <a
              href={buildAddressUrl(task[role])}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-xs hover:underline"
              style={{ color: task[role].toLowerCase() === address?.toLowerCase() ? 'var(--accent-hover)' : 'var(--ink-2)' }}
            >
              {formatAddr(task[role])}
              {task[role].toLowerCase() === address?.toLowerCase() && ' (you)'}
            </a>
          </div>
        ))}
      </div>

      {/* Hashes + deadline */}
      <div className="px-5 pb-3 flex flex-col gap-1">
        <HashRow label="Criteria" hash={task.criteriaHash} />
        {task.deliverableHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
          <HashRow label="Deliverable" hash={task.deliverableHash} />
        )}
        <div className="flex items-center gap-1.5 text-xs" style={{ color: expired && isOpen ? 'var(--danger)' : 'var(--subtle)' }}>
          <Clock className="size-3" />
          <span>Deadline: {formatDeadline(task.deadline)}{expired && isOpen ? ' (expired)' : ''}</span>
        </div>
        {txHash && (
          <a href={buildTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
            Last tx <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {/* Actions (only for open tasks, right person) */}
      {isOpen && (
        <div className="px-5 pb-4 flex flex-col gap-2.5">
          {/* Worker: submit deliverable */}
          {isWorker && status === 0 && !expired && (
            <div className="flex flex-col gap-1.5">
              <textarea
                rows={2}
                value={deliverable}
                onChange={e => setDeliverable(e.target.value)}
                placeholder="Paste a link or describe your deliverable…"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              {deliverable.trim() && (
                <span className="mono text-xs break-all" style={{ color: 'var(--subtle)' }}>
                  Hash: {hashText(deliverable)}
                </span>
              )}
              {onWrongChain
                ? <SwitchBtn isSwitching={isSwitching} switchChain={doSwitch} />
                : <ActionBtn label="Submit deliverable" icon={<RefreshCw className="size-3.5" />} color="var(--accent)" disabled={actionDisabled || !deliverable.trim()} onClick={handleSubmit} pending={isPending || isConfirming} />
              }
            </div>
          )}

          {/* Checker: approve + reject on submitted task */}
          {isChecker && status === 1 && (
            <div className="flex flex-col gap-1.5">
              <input
                value={verdictNote}
                onChange={e => setVerdictNote(e.target.value)}
                placeholder="Verdict note (optional, hashed on-chain)"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              {onWrongChain
                ? <SwitchBtn isSwitching={isSwitching} switchChain={doSwitch} />
                : (
                  <div className="flex gap-2">
                    <ActionBtn label="Approve" icon={<CheckCircle className="size-3.5" />} color="var(--success)" disabled={actionDisabled} onClick={handleApprove} pending={isPending || isConfirming} />
                    <ActionBtn label="Reject"  icon={<XCircle className="size-3.5" />}     color="var(--danger)"  disabled={actionDisabled} onClick={handleReject}  pending={isPending || isConfirming} />
                  </div>
                )
              }
            </div>
          )}

          {/* Checker: reject on funded task */}
          {isChecker && status === 0 && (
            <div className="flex flex-col gap-1.5">
              <input
                value={verdictNote}
                onChange={e => setVerdictNote(e.target.value)}
                placeholder="Verdict note (optional)"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              {onWrongChain
                ? <SwitchBtn isSwitching={isSwitching} switchChain={doSwitch} />
                : <ActionBtn label="Reject task" icon={<XCircle className="size-3.5" />} color="var(--danger)" disabled={actionDisabled} onClick={handleReject} pending={isPending || isConfirming} />
              }
            </div>
          )}

          {/* Anyone: refund after deadline */}
          {expired && (
            onWrongChain
              ? <SwitchBtn isSwitching={isSwitching} switchChain={doSwitch} />
              : <ActionBtn label="Refund (deadline passed)" icon={<RefreshCw className="size-3.5" />} color="var(--muted)" disabled={actionDisabled} onClick={handleRefund} pending={isPending || isConfirming} />
          )}
        </div>
      )}

      {/* Withdraw claimable */}
      {address && (
        address.toLowerCase() === task.buyer.toLowerCase() ||
        address.toLowerCase() === task.worker.toLowerCase()
      ) && (
        <ClaimableRow address={address} onAction={onAction} />
      )}
    </div>
  )
}

// ── Claimable withdraw row ───────────────────────────────────────────

function ClaimableRow({ address, onAction }: { address: string; onAction: () => void }) {
  const [shown, setShown] = useState(false)
  const [altAddr, setAltAddr] = useState('')
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  if (!shown) {
    return (
      <div className="px-5 pb-3">
        <button onClick={() => setShown(true)} className="text-xs underline" style={{ color: 'var(--muted)' }}>
          Withdraw claimable balance
        </button>
      </div>
    )
  }

  function withdraw() {
    const hasAlt = altAddr.trim().length > 0
    writeContract({
      address: ESCROW_CONTRACT.address,
      abi: ESCROW_CONTRACT.abi,
      functionName: hasAlt ? 'withdrawTo' : 'withdraw',
      args: hasAlt ? [altAddr.trim() as `0x${string}`] : [],
      chainId: ESCROW_CONFIG.chainId,
    }, {
      onSuccess() { toast.success('Withdrawn!'); onAction() },
      onError(e)  { toast.error(e.message?.split('\n')[0] ?? 'Withdraw failed') },
    })
  }

  // suppress TS "address unused", it's captured in closure via props
  void address

  return (
    <div className="px-5 pb-4 flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Withdraw claimable</span>
      <input
        value={altAddr}
        onChange={e => setAltAddr(e.target.value.trim())}
        placeholder="Alternate address (optional, for blocked recipients)"
        className="mono w-full rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      />
      <button
        disabled={isPending || isConfirming}
        onClick={withdraw}
        className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'var(--accent)' }}
      >
        {isPending || isConfirming
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirming…</span>
          : 'Withdraw'
        }
      </button>
      {txHash && (
        <a href={buildTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
          Withdraw tx <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  )
}
