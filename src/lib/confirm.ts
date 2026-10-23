import { waitForTransactionReceipt } from 'wagmi/actions'
import type { QueryClient } from '@tanstack/react-query'
import { config } from '@/config'
import { ESCROW_CONFIG } from '@/escrow-config'

type ChainId = (typeof config.chains)[number]['id']

/** Wait until a transaction is mined, then refresh every cached read (balances, claimables). Throws if it reverted. */
export async function confirmed(hash: `0x${string}`, queryClient: QueryClient) {
  const receipt = await waitForTransactionReceipt(config, { hash, chainId: ESCROW_CONFIG.chainId as ChainId })
  if (receipt.status !== 'success') throw new Error('Transaction reverted')
  void queryClient.invalidateQueries()
  return receipt
}
