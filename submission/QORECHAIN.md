# QoreChain "Build Before Q-Day": submission draft (Quantum Pass)

**Project:** QDay Radar
**One-liner:** Find out if your wallet's public key is already exposed to a future quantum attacker on 7 EVM chains, then anchor a hybrid-signed record and a post-quantum successor on QoreChain.
**Category:** Quantum Pass (also eligible: Regional, Europe)
**Repo:** https://github.com/yayguru/qday-radar (Apache-2.0)
**Live app:** https://qday-radar.merjkerm.workers.dev
**Cover image (16:9, required ≥1200×675):** `submission/cover-16x9.png` (1280×720). Old `featured.png` is 1200×630 = not 16:9, don't use it.
**Video (≤3 min):** <link after upload>
**Testnet contract (qorechain-diana, chain 9800):** QDayRadar `<fill in from deployments/testnet.json after deploy>`
**Hybrid-signed tx (EVM window open):** `<tx hash from npm run ops -- deploy output>`
**Deployer / attester:** 0xD0FaB2667Be5B435c1D7Ea7010658a3621153d53 (qor16ratyenmuk6rtswhafcpqev2xcs3202n9wsw3m)
**QoreX testnet address:** <your QoreX address>

## Description (paste)

An Ethereum address is a hash of a public key. The first time a wallet sends a transaction, its public key becomes public forever, which is exactly what Shor's algorithm needs. Most people have no idea which of their wallets are already exposed, on which chains, or how much sits on them.

QDay Radar answers that in two seconds:

- **Scan:** a web app, JSON API and Telegram bot check nonce, balance and code on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain and Celo.
  - They classify plain EOAs, EIP-7702-delegated EOAs (still exposed) and smart-contract wallets.
  - They score risk 0–3 and hash the evidence (keccak256).
- **Attest on QoreChain:** `QDayRadar.attestScan()` can only be called by an attester whose account has a registered ML-DSA-87 key.
  - The contract checks this through the `pqcKeyStatus` precompile (0x…0A02) and fails closed.
  - Every write goes through an EVM window opened by a hybrid-signed (secp256k1 + ML-DSA-87) native-lane transaction.
- **Migrate:**
  - The owner of an exposed wallet signs a migration message with the old key.
  - A QoreChain account holding a live ML-DSA key submits `linkSuccessor()`.
  - The contract verifies both the legacy ECDSA signature (with a low-s check) and the PQC key on-chain.
  - `status()` keeps showing whether the successor's post-quantum key is still active.
- **QoreX:** the app discovers QoreX through EIP-6963 and shows the connected account's live PQC key status from the precompile.

**Built with:**
- `create-qorechain-dapp` (foundry template), `@qorechain/sdk`, `@qorechain/evm`, viem;
- Cloudflare Workers;
- 12 Foundry tests (the PQC precompile is mocked via `vm.etch`) and 10 scanner tests.

**Honest limits:**
- QoreX can't yet send EVM transactions or personal_sign, so `linkSuccessor` is submitted through the SDK CLI (`npm run ops -- link`). The UI shows the exact message to sign.
- The exposure scan is a lower bound: a key could also have leaked off-chain.

## How it's made (paste)

- Scaffolded with `create-qorechain-dapp` (Foundry template). Contract `src/QDayRadar.sol`, 12 Foundry tests; the `pqcKeyStatus` precompile (0x…0A02) is mocked with `vm.etch` in tests and read live on testnet.
- Operator scripts on `@qorechain/sdk` + `@qorechain/evm`: `scripts/window.ts` registers the ML-DSA-87 key and opens the EVM authorisation window with a hybrid-signed (secp256k1 + ML-DSA-87) native-lane tx; `scripts/ops.ts` deploys, attests and links successors with viem.
- Scanner + API + Telegram webhook in one Cloudflare Worker (`app/`), 10 vitest tests, RPC fallbacks for 7 EVM chains.
- Frontend detects QoreX via EIP-6963 and reads the connected account's PQC key status from the precompile.

## Kits and network features (tick in the form)

create-qorechain-dapp · @qorechain/sdk · @qorechain/evm · QoreX (EIP-6963) · PQC key registry / `pqcKeyStatus` precompile · ML-DSA-87 hybrid signatures · EVM authorisation window

## Testnet address field (qor1…)

qor16ratyenmuk6rtswhafcpqev2xcs3202n9wsw3m (deployer/attester). After deploy also add the contract from `submission/testnet-proof.md`.

## Checklist
- [x] Public repo, Apache-2.0, README
- [x] create-qorechain-dapp scaffold
- [x] QoreX integration (EIP-6963 detect + account + PQC status)
- [ ] Deployed on testnet: blocked on test QOR. After faucet: `bash scripts/after-faucet.sh` (one command, testnet only)
- [ ] ≥1 hybrid-signed transaction (comes with the deploy)
- [x] Cover image 16:9 (`submission/cover-16x9.png`)
- [ ] Video ≤ 3 min
