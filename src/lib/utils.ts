import { keccak256, toHex } from 'viem'

export const formatAddr = (addr: string) =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`

/** keccak256 of a UTF-8 string, returned as a 0x-prefixed hex bytes32. */
export function hashText(text: string): `0x${string}` {
  return keccak256(toHex(text))
}

export const STATUS_LABEL: Record<number, string> = {
  0: 'Funded',
  1: 'Submitted',
  2: 'Paid',
  3: 'Refunded',
}

export const STATUS_COLOR: Record<number, string> = {
  0: 'var(--status-funded)',
  1: 'var(--status-submitted)',
  2: 'var(--status-paid)',
  3: 'var(--status-refunded)',
}

export function formatDeadline(ts: bigint): string {
  const d = new Date(Number(ts) * 1000)
  return d.toLocaleString()
}

export function isExpired(deadline: bigint): boolean {
  return Date.now() / 1000 >= Number(deadline)
}

/** Parse a decimal USDC string into raw 6-decimal units. */
export function parseUsdc(amount: string): bigint {
  const [int, frac = ''] = amount.split('.')
  const padded = frac.padEnd(6, '0').slice(0, 6)
  return BigInt(int || '0') * 1_000_000n + BigInt(padded || '0')
}

/** Format raw 6-decimal USDC units as a readable string. */
export function formatUsdc(raw: bigint): string {
  const n = Number(raw) / 1e6
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n)
}
