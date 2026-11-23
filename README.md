# 📡 QDay Radar

**Is your wallet already quantum-exposed?** QDay Radar scans any EVM address on 7 chains, tells you whether its secp256k1 public key is already public (the thing a quantum computer needs to forge your signatures), and lets you anchor a **hybrid-signed** record and a **post-quantum successor** on **QoreChain**.

- Live app: **https://qday-radar.merjkerm.workers.dev**
- Category: **Quantum Pass** — Build Before Q-Day (QoreChain Developer Fest)
- Network: QoreChain testnet `qorechain-diana` (EVM chain id 9800)
- Contract: `QDayRadar` — address in [`deployments/testnet.json`](deployments/testnet.json)

## Why

An Ethereum address is a hash of a public key. While an address has only *received* funds, the public key stays hidden. The first time it **sends** a transaction, the signature reveals the public key forever, on every chain where that key is used. Shor's algorithm on a large enough quantum computer turns that public key into the private key. That is the "harvest now, forge later" risk: the data an attacker needs is already public today.

Most people have no idea which of their wallets are exposed, on which chains, and how much is sitting on them. QDay Radar answers that in two seconds, and then gives the owner a way out on QoreChain, where every account can hold a registered ML-DSA-87 (FIPS 204) key.

## What it does

1. **Scan** (web app, JSON API and Telegram bot): for Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain and Celo it reads the nonce, balance and code of the address.
   - `nonce > 0` on an EOA → public key revealed on that chain.
   - EIP-7702 delegated EOAs (`0xef0100…`) still count as exposed: the ECDSA key still controls them.
   - Smart-contract wallets are reported separately (no single ECDSA key to forge).
   - Risk 0–3: hidden / exposed-empty / exposed-with-funds / exposed with funds on 3+ chains. The evidence is hashed (`keccak256`) so an on-chain record can be checked against the API output.
2. **Attest on QoreChain**: an operator whose account has a registered ML-DSA-87 key records the scan with `attestScan()`. The contract **fails closed**: it asks the PQC precompile `pqcKeyStatus` (`0x…0A02`) and refuses an attester without a registered post-quantum key. Every EVM transaction is admitted only inside an EVM window opened by a **hybrid-signed** (secp256k1 + ML-DSA-87) native-lane transaction.
3. **Link a post-quantum successor**: the owner of an exposed wallet signs a migration message with the *old* key (personal_sign), and the QoreChain account with a registered ML-DSA key submits `linkSuccessor()`. The contract checks both halves on-chain: the ECDSA signature of the legacy key **and** that the sender holds a live PQC key. `status()` later shows whether the successor's ML-DSA key is still active.
4. **QoreX**: the web app finds QoreX through EIP-6963 (`network.qore.qorex`), reads your account and shows its live PQC key status from the precompile.

## Architecture

```
            ┌──────────── Cloudflare Worker (app/worker.ts) ────────────┐
 browser ──►│  /            UI (app/page.html, QoreX via EIP-6963)      │
 Telegram ─►│  /api/scan    7-chain exposure scan (app/scan.ts)          │──► public RPCs (with fallbacks)
            │  /api/pqc     pqcKeyStatus via 0x…0A02                     │──► QoreChain EVM testnet
            │  /api/registry  QDayRadar.status / counts                  │
            │  /telegram/<secret>  /check 0x… bot (optional)             │
            └────────────────────────────────────────────────────────────┘
 operator CLI (scripts/ops.ts, @qorechain/sdk + viem)
   register ML-DSA-87 key ─► open EVM window (hybrid-signed) ─► deploy / attestScan / linkSuccessor
 contract (src/QDayRadar.sol)
   attesters ─ scans[address] ─ successors[address] ─ PQC precompile checks (fail closed)
```

## Run it

```sh
npm install
npm run forge-std          # forge-std for the tests
npm test                   # 12 Foundry tests + 10 scanner tests
npm run dev                # local worker on http://localhost:8787
```

Operator flow on testnet (needs test QOR from https://dashboard.qorechain.io/faucet):

```sh
cp .env.example .env.deployer   # PRIVATE_KEY + QORE_PQC_RECOVERY_CODE (npm run window recovery-code)
npm run window status
npm run ops -- deploy           # registers the ML-DSA-87 key, opens a hybrid-signed window, deploys
npm run ops -- attest 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
npm run ops -- status 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

Deploy the worker: `npx wrangler deploy` and set `RADAR_ADDRESS` in `wrangler.toml`.
Telegram bot (optional): `wrangler secret put TG_BOT_TOKEN`, `wrangler secret put TG_WEBHOOK_SECRET`, then point the bot's webhook at `https://<worker>/telegram/<secret>`.

## Tests

| Suite | What it proves |
|---|---|
| `test/QDayRadar.t.sol` (12) | only attesters with a registered PQC key can record scans (fail closed); masks are consistent; re-scans don't double count; successor link needs the legacy ECDSA signature, bound to the caller, and a PQC key; one link per legacy address; `status()` notices a revoked key; owner-only admin |
| `app/scan.test.ts` (10) | EOA / 7702 / contract classification, risk levels, RPC failures excluded from the scanned mask, exposed ⊆ scanned (the contract invariant), deterministic evidence hash, Telegram text |

The PQC precompile is replaced by a mock with `vm.etch` in Foundry; on testnet the real `0x…0A02` is called (`/api/pqc`).

## Testnet addresses

See [`deployments/testnet.json`](deployments/testnet.json): QDayRadar contract and the operator/attester account.

## Limits (honest)

- QoreX does not yet support EVM `eth_sendTransaction`/`personal_sign`, so the web app reads the QoreX account and its PQC status, and the successor link is submitted with the SDK CLI (`npm run ops -- link`). When QoreX adds EVM signing, the same contract call works from the browser.
- Exposure is per key. The scanner looks at 7 chains; a key used elsewhere may also be exposed.
- Balances are native coins only (no token prices), to stay keyless and free.

## Credits

Scaffolded with `npx create-qorechain-dapp --template foundry` (QoreChain Association, Apache-2.0): `scripts/window.ts` comes from that template, lightly changed to export its helpers. Uses `@qorechain/sdk`, `@qorechain/evm`, viem, forge-std, Cloudflare Workers. See [AI_USAGE.md](AI_USAGE.md).

## License

Apache-2.0
