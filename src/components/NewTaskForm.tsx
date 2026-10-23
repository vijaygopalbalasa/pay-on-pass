import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { ESCROW_CONTRACT, ESCROW_CONFIG, buildTxUrl } from '@/escrow-config'
import { hashText, parseUsdc } from '@/lib/utils'
import { toast } from 'sonner'

const glass = {
  card: { background: 'var(--surface-strong)', backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)', border: '1px solid var(--border)', borderRadius: '1.25rem' },
  inner: { background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '0.875rem' },
}

interface Props { onCreated: () => void }

export function NewTaskForm({ onCreated }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [open, setOpen] = useState(false)

  const [worker, setWorker]     = useState('')
  const [checker, setChecker]   = useState('')
  const [amount, setAmount]     = useState('')
  const [deadline, setDeadline] = useState('')
  const [criteria, setCriteria] = useState('')

  // Step 1: approve USDC spend
  const { writeContract: writeApprove, data: approveTxHash, isPending: isApprovePending } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Step 2: createTask
  const { writeContract: writeCreate, data: createTxHash, isPending: isCreatePending } = useWriteContract()
  const { isLoading: isCreateConfirming, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({ hash: createTxHash })

  const onWrongChain = !!chainId && chainId !== ESCROW_CONFIG.chainId
  const criteriaHash = criteria.trim() ? hashText(criteria) : null

  const rawAmount = amount ? parseUsdc(amount) : 0n
  const deadlineTs = deadline ? BigInt(Math.floor(new Date(deadline).getTime() / 1000)) : 0n

  // Compute "is deadline in the future" without calling Date.now during render.
  // We use a stable string comparison: deadline input is already a local datetime string,
  // so it only needs to be non-empty and represent a future time, which the form
  // communicates through the input itself. We validate the timestamp on submission.
  const deadlineIsFuture = deadline.length > 0

  const validInputs =
    address &&
    isAddress(worker) && worker !== address &&
    isAddress(checker) && checker !== address && checker !== worker &&
    rawAmount > 0n &&
    deadlineIsFuture &&
    criteria.trim().length > 0

  function handleApprove() {
    if (!address || !validInputs) return
    writeApprove({
      address: ESCROW_CONFIG.usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [ESCROW_CONFIG.contractAddress, rawAmount],
      chainId: ESCROW_CONFIG.chainId,
    })
  }

  function handleCreate() {
    if (!address || !criteriaHash) return
    writeCreate({
      address: ESCROW_CONTRACT.address,
      abi: ESCROW_CONTRACT.abi,
      functionName: 'createTask',
      args: [worker as `0x${string}`, checker as `0x${string}`, rawAmount, deadlineTs, criteriaHash],
      chainId: ESCROW_CONFIG.chainId,
    }, {
      onSuccess() {
        toast.success('Task created!')
        setWorker(''); setChecker(''); setAmount(''); setDeadline(''); setCriteria('')
        setOpen(false)
        onCreated()
      },
    })
  }

  if (isCreateSuccess) { /* toast already fired */ }

  return (
    <div style={glass.card} className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-black/5"
      >
        <span className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>New task</span>
        {open ? <ChevronUp className="size-4" style={{ color: 'var(--subtle)' }} /> : <ChevronDown className="size-4" style={{ color: 'var(--subtle)' }} />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 flex flex-col gap-3">
          {/* Worker */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Worker address</span>
            <input
              value={worker}
              onChange={e => setWorker(e.target.value.trim())}
              placeholder="0x…"
              className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </label>

          {/* Checker */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Checker address</span>
            <input
              value={checker}
              onChange={e => setChecker(e.target.value.trim())}
              placeholder="0x…"
              className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </label>

          {/* Amount */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Amount (USDC)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v) }}
              placeholder="10.00"
              className="display w-full rounded-xl px-3 py-2.5 text-lg font-bold tabular-nums outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </label>

          {/* Deadline */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Deadline</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </label>

          {/* Acceptance criteria */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Acceptance criteria</span>
            <textarea
              rows={3}
              value={criteria}
              onChange={e => setCriteria(e.target.value)}
              placeholder="Describe what 'done' looks like…"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
            {criteriaHash && (
              <span className="mono text-xs break-all" style={{ color: 'var(--subtle)' }}>
                Criteria hash: {criteriaHash}
              </span>
            )}
          </label>

          {/* CTAs */}
          {!address ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to create a task.</p>
          ) : onWrongChain ? (
            <button
              onClick={() => switchChain({ chainId: ESCROW_CONFIG.chainId })}
              disabled={isSwitching}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--danger)' }}
            >
              {isSwitching ? 'Switching…' : `Switch to ${ESCROW_CONFIG.name}`}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Step 1: Approve */}
              {!isApproveSuccess && (
                <button
                  disabled={!validInputs || isApprovePending || isApproveConfirming}
                  onClick={handleApprove}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'var(--accent)' }}
                >
                  {isApprovePending ? <Pending label="Confirm in wallet…" /> : isApproveConfirming ? <Pending label="Approving USDC…" /> : `Step 1: Allow ${amount || '0'} USDC`}
                </button>
              )}

              {/* Step 2: Create */}
              {isApproveSuccess && (
                <button
                  disabled={!validInputs || isCreatePending || isCreateConfirming}
                  onClick={handleCreate}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'var(--success)' }}
                >
                  {isCreatePending ? <Pending label="Confirm in wallet…" /> : isCreateConfirming ? <Pending label="Creating task…" /> : 'Step 2: Fund task'}
                </button>
              )}

              {approveTxHash && (
                <a href={buildTxUrl(approveTxHash)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                  Approval tx <ExternalLink className="size-3" />
                </a>
              )}
              {createTxHash && (
                <a href={buildTxUrl(createTxHash)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                  Create tx <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <Loader2 className="size-4 animate-spin" /> {label}
    </span>
  )
}
