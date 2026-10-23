import { WalletHeader } from '@/components/WalletHeader'
import { NewTaskForm } from '@/components/NewTaskForm'
import { TaskCard } from '@/components/TaskCard'
import { useTasks } from '@/hooks/useTasks'
import { Loader2 } from 'lucide-react'

export default function App() {
  const { tasks, loading, refresh } = useTasks()

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <WalletHeader />

      <main className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
        {/* Hero blurb */}
        <div className="flex flex-col gap-1">
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            Pay on Pass
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            USDC held in escrow, released to the worker when the checker approves, returned to the buyer otherwise. No admin. No fees.
          </p>
        </div>

        {/* New task form */}
        <NewTaskForm onCreated={() => { void refresh() }} />

        {/* Task list */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="display text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Tasks ({tasks.length})
            </h2>
            <button
              onClick={() => { void refresh() }}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              {loading ? <Loader2 className="size-3 animate-spin" /> : null}
              Refresh
            </button>
          </div>

          {loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: 'var(--subtle)' }}>
              <Loader2 className="size-4 animate-spin" /> Loading tasks…
            </div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="rounded-2xl px-6 py-12 text-center text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
              No tasks yet. Create one above to get started.
            </div>
          )}

          {tasks.map(task => (
            <TaskCard key={task.taskId.toString()} task={task} onAction={() => { void refresh() }} />
          ))}
        </div>
      </main>
    </div>
  )
}
