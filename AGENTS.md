# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Pay on Pass: USDC task escrow on Arc. A buyer funds a task with USDC, a worker submits a deliverable hash, and a checker approves (pays the worker) or rejects (refunds the buyer). If the deadline passes with no resolution, anyone can trigger a refund. Blocklisted recipients automatically receive a claimable balance they can withdraw to an alternate address.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Deployed Contracts

| Network | Address | Explorer |
|---|---|---|
| Arc Testnet | `0x183532f5286b7e82e1f9f18f8be3d9a49c51fe97` | https://explorer.testnet.arc.io/address/0x183532f5286b7e82e1f9f18f8be3d9a49c51fe97 |
| Deploy tx | `0xa45feac45530ca8639ef513caff37f0514e7a8cf18f1cb745902cc27f0e6c4e6` | - |

Constructor arg: USDC token `0x3600000000000000000000000000000000000000`

## Arc mainnet

Live at `0x1d587d48fa5e8bf338d4b00830d24760c029fb88` (chain 5042), source verified on Sourcify (exact match). Build the app for it with `VITE_NETWORK=ARC-MAINNET bun run build`. README.md lists the mainnet transactions and the fixes made after the Arc Studio build.

## Key Files

- `src/App.tsx` - Main application logic (thin composition root)
- `src/components/WalletHeader.tsx` - Connected wallet, USDC balance, claimable badge
- `src/components/NewTaskForm.tsx` - Two-step approve + createTask form
- `src/components/TaskCard.tsx` - Task display + worker/checker/refund actions + withdraw
- `src/hooks/useTasks.ts` - Reads TaskCreated events + getTask for live task list
- `src/escrow-config.ts` - Contract address + ABI, per-network config (testnet + mainnet stubs)
- `src/lib/utils.ts` - hashText, formatUsdc, parseUsdc, status labels
- `src/config.ts` - wagmi config (chains, connectors, transports)
- `contracts/PayOnPassEscrow.sol` - Escrow contract
- `contracts/test/PayOnPassEscrow.t.sol` - 26 Foundry tests (all passing)

## To Run

```bash
bun install
bun run dev
```
