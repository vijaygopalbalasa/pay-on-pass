import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ESCROW_CONFIG } from '@/escrow-config'
import { formatAddr, formatUsdc } from '@/lib/utils'

export function WalletHeader() {
  const { address, chainId } = useAccount()

  const { data: rawBalance } = useReadContract({
    address: ESCROW_CONFIG.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ESCROW_CONFIG.chainId,
    query: { enabled: !!address },
  })

  const { data: rawClaimable } = useReadContract({
    address: ESCROW_CONFIG.contractAddress,
    abi: [
      { name: 'claimable', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'recipient', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }] },
    ] as const,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    chainId: ESCROW_CONFIG.chainId,
    query: { enabled: !!address },
  })

  const onWrongChain = !!chainId && chainId !== ESCROW_CONFIG.chainId

  return (
    <header className="sticky top-0 z-40 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)', backdropFilter: 'blur(24px)' }}>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
            Pay on Pass
          </span>
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            {ESCROW_CONFIG.chainId === 5042 ? 'mainnet' : 'testnet'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {address && (
            <div className="hidden flex-col items-end sm:flex" style={{ gap: 1 }}>
              <span className="mono text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {formatAddr(address)}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs tabular-nums" style={{ color: 'var(--success)' }}>
                  {rawBalance !== undefined ? formatUsdc(rawBalance) : '-'} USDC
                </span>
                {rawClaimable !== undefined && (rawClaimable) > 0n && (
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
                    +{formatUsdc(rawClaimable)} claimable
                  </span>
                )}
              </div>
            </div>
          )}

          {onWrongChain && (
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
              Wrong network
            </span>
          )}

          <ConnectKitButton />
        </div>
      </div>
    </header>
  )
}
