import { useEffect, useState, useCallback } from 'react'
import { createPublicClient, http } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { ESCROW_CONTRACT, ESCROW_CONFIG } from '@/escrow-config'

export interface TaskData {
  taskId: bigint
  buyer: string
  worker: string
  checker: string
  amount: bigint
  deadline: bigint
  criteriaHash: string
  deliverableHash: string
  status: number   // 0=Funded 1=Submitted 2=Paid 3=Refunded
}

const client = createPublicClient({
  chain: ESCROW_CONFIG.chainId === arc.id ? arc : arcTestnet,
  transport: http(ESCROW_CONFIG.rpcUrl),
})

export function useTasks() {
  const [tasks, setTasks] = useState<TaskData[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback((): Promise<void> => {
    setLoading(true)
    // Read the count and then each task. A log query from the deploy block stops working once the chain is more
    // than 10,000 blocks past it (the RPC refuses the range), which on Arc is a few hours.
    return client.readContract({
      address: ESCROW_CONTRACT.address,
      abi: ESCROW_CONTRACT.abi,
      functionName: 'taskCount',
    }).then((count) =>
      Promise.all(
        Array.from({ length: Number(count as bigint) }, (_, i) => BigInt(i)).map(async (id) => {
          const raw = await client.readContract({
            address: ESCROW_CONTRACT.address,
            abi: ESCROW_CONTRACT.abi,
            functionName: 'getTask',
            args: [id],
          }) as Omit<TaskData, 'taskId'>
          // getTask returns a struct, which viem decodes to an object with named fields
          return { taskId: id, ...raw }
        })
      )
    ).then((fetched) => {
      setTasks(fetched.slice().reverse())
    }).catch((e: unknown) => {
      console.error('useTasks fetch error', e)
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  // Trigger initial load. refresh() is async but the effect cleanup is sync -
  // we intentionally ignore the returned promise here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh() }, [])

  return { tasks, loading, refresh }
}
