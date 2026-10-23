/**
 * PayOnPassEscrow deployment config.
 * Add an entry here to point the app at a different network or address
 * without touching any other code.
 */

import artifact from '../contracts/out/PayOnPassEscrow.sol/PayOnPassEscrow.json'

export interface EscrowNetworkConfig {
  chainId: number
  name: string             // shown in the UI
  contractAddress: `0x${string}`
  usdcAddress: `0x${string}`
  explorerBase: string     // no trailing slash
  rpcUrl: string
}

const ARC_USDC = '0x3600000000000000000000000000000000000000' as const

export const ESCROW_NETWORKS: Record<string, EscrowNetworkConfig> = {
  /** Arc Testnet (chain 5042002), default */
  'ARC-TESTNET': {
    chainId: 5042002,
    name: 'Arc Testnet',
    contractAddress: '0x183532f5286b7e82e1f9f18f8be3d9a49c51fe97',
    usdcAddress: ARC_USDC,
    explorerBase: 'https://testnet.arcscan.app',
    rpcUrl: 'https://rpc.testnet.arc.io',
  },
  /** Arc Mainnet (chain 5042) */
  'ARC-MAINNET': {
    chainId: 5042,
    name: 'Arc',
    contractAddress: '0x1d587d48fa5e8bf338d4b00830d24760c029fb88',
    usdcAddress: ARC_USDC,
    explorerBase: 'https://explorer.arc.io',
    rpcUrl: 'https://rpc.mainnet.arc.io',
  },
}

/** Active network: build with VITE_NETWORK=ARC-MAINNET for mainnet, testnet otherwise. */
export const ACTIVE_NETWORK =
  import.meta.env.VITE_NETWORK === 'ARC-MAINNET' ? 'ARC-MAINNET' : 'ARC-TESTNET'
export const ESCROW_CONFIG: EscrowNetworkConfig = ESCROW_NETWORKS[ACTIVE_NETWORK]

export const ESCROW_CONTRACT = {
  address: ESCROW_CONFIG.contractAddress,
  abi: artifact.abi,
} as const

export function buildTxUrl(txHash: string): string {
  return `${ESCROW_CONFIG.explorerBase}/tx/${txHash}`
}

export function buildAddressUrl(address: string): string {
  return `${ESCROW_CONFIG.explorerBase}/address/${address}`
}
