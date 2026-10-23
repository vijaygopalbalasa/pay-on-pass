# Pay on Pass

USDC escrow for one piece of work. A buyer locks USDC for a task, a worker submits, and a checker either approves it (the worker is paid) or rejects it (the buyer is refunded). If nobody acts by the deadline, anyone can send the money back to the buyer.

Built in [Arc Studio](https://studio.arc.io) and live on Arc mainnet.

- Live app: LIVE_APP_URL
- Arc Studio project: https://studio.arc.io/app/cd8a547a-4525-4f3f-af73-b655ac9f414c
- Contract on Arc mainnet: [`0x1d587d48fa5e8bf338d4b00830d24760c029fb88`](https://explorer.arc.io/address/0x1d587d48fa5e8bf338d4b00830d24760c029fb88), source verified on [Sourcify](https://repo.sourcify.dev/5042/0x1d587d48fa5e8bf338d4b00830d24760c029fb88) (exact match), deployed in [`0xadf7490f…`](https://explorer.arc.io/tx/0xadf7490f06741ffa9701dc60294e43e02dbb96030d30388bd11f0d7898087576)
- Contract on Arc testnet: [`0x183532f5286b7e82e1f9f18f8be3d9a49c51fe97`](https://testnet.arcscan.app/address/0x183532f5286b7e82e1f9f18f8be3d9a49c51fe97)

## First mainnet task

Task 0, 0.10 USDC, run through the app on October 23, 2026:

| Step | Transaction |
|---|---|
| Buyer allows 0.10 USDC | [`0x4986f29c…`](https://explorer.arc.io/tx/0x4986f29c121892aa722c802b4c31e9e85d56e7fce1607a7a09846db52d1beca8) |
| Buyer funds the task | [`0xe6daece0…`](https://explorer.arc.io/tx/0xe6daece03f7027a89a73f4c54844ffa9e25ac30299784a009032a8758950fa36) |
| Worker submits the deliverable | [`0x522feded…`](https://explorer.arc.io/tx/0x522feded386946b0c88308c3b6f087be546a8f8b3b3b42fdb8e718f1572f2b9c) |
| Checker approves; the worker receives 0.10 USDC | [`0xe3ca9d91…`](https://explorer.arc.io/tx/0xe3ca9d91d711c36571b941e7bf03242a5ab314c5ab098124309abcdd8b2ca824) |

The walkthrough video shows task 1, the same flow run again after the fix to when the app reports success (below): [funded](https://explorer.arc.io/tx/0x0d6480b0ac1e812e088e01fa8d9ffe1986f96191083f564c97c54b62dffe708e), [submitted](https://explorer.arc.io/tx/0x8cc3c2031ce15d7da21539c5d881932a286b25cfab700348e1b2a8dc0b66d9d9), [approved and paid](https://explorer.arc.io/tx/0xfad3dd9f552ae381930703dde3dae9e219e79853726a0f1bd7459c5d981d31a0).

## How it works

- `createTask(worker, checker, amount, deadline, criteriaHash)` pulls the USDC into escrow. The caller is the buyer.
- `submit(taskId, deliverableHash)`: the worker only, before the deadline.
- `approve(taskId, verdictHash)` pays the worker. `reject(taskId, verdictHash)` refunds the buyer. Checker only.
- `refundAfterDeadline(taskId)`: anyone, once the deadline has passed and the task is still open.
- USDC can block an address. If a payout to a blocked address fails, the amount is credited to that address instead of reverting, so the other side is never stuck. The owner of the credit withdraws it with `withdraw()` or sends it to another address they control with `withdrawTo(to)`.
- No owner, no admin keys, no fees, no upgrades. The contract's USDC balance always equals the open tasks plus the credited balances (tested, including the blocked-address paths).

## Run it

```bash
bun install
forge build                              # the app imports the compiled ABI from contracts/out
forge test                               # 26 Foundry tests
bun run dev                              # Arc testnet
VITE_NETWORK=ARC-MAINNET bun run build   # Arc mainnet build in dist/
```

The app picks its network from `VITE_NETWORK` (`ARC-TESTNET` by default, `ARC-MAINNET` for mainnet). USDC is Arc's ERC-20 interface at `0x3600000000000000000000000000000000000000` on both networks. The `scripts/` folder holds Arc Studio's own sandbox deploy helpers; they need its sandbox and are not used here.

## What changed after Arc Studio

Arc Studio wrote the contract, the tests and the app, and deployed the contract to Arc testnet. Running the full flow with three real wallets, first on testnet and then on mainnet, found two bugs in the app, fixed here. The contract logic did not change.

- The task list read the contract's task struct as an array, so every field came back empty. It now reads the named fields. (Found on testnet.)
- "Task created" and "Transaction confirmed" appeared as soon as the wallet returned a transaction hash, before the transaction was mined, so the list and the balances did not refresh. The app now waits for the receipt, then refreshes the list and every balance. (Found in the first mainnet run.)

Also added by hand: Arc mainnet next to testnet with a `VITE_NETWORK` switch, the mainnet address and the block the task list starts reading from, and network labels that follow the active network. Arc Studio deploys to testnet only, so the mainnet contract was deployed separately with the same compiled code and verified on Sourcify.

## Limits

- Not audited. Keep amounts small.
- The checker is trusted to judge the work. The contract enforces who can act and when, not whether the work is good.
- The criteria and the deliverable are stored as hashes; the text itself lives off chain.

## License

MIT
