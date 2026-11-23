# QDay Radar: demo video (≈2:30)

**0:00–0:20.** "Every Ethereum wallet that has ever sent a transaction has published its public key. A large quantum computer turns that key into the private key. Which of your wallets are already exposed?"

**0:20–1:00.** Open https://qday-radar.merjkerm.workers.dev and paste vitalik.eth's address.
- The radar shows 7 chains with exposed/hidden status, balances and a risk score of 3/3.
- Next, paste a fresh, receive-only address. It shows "hidden" everywhere, risk 0.

**1:00–1:30.**
- Click "Connect QoreX". The app detects QoreX via EIP-6963, shows the account and its live ML-DSA-87 key status, read from the `pqcKeyStatus` precompile 0x…0A02.

**1:30–2:10.** In a terminal, run `npm run ops -- deploy` and then `attest <address>`.
- Point out the ML-DSA-87 key registration and the hybrid-signed native tx that opens the EVM window.
- Show the deploy and the attestScan tx hash.
- Back in the app, the registry panel shows the on-chain record, with an evidence hash matching the API.

**2:10–2:30.**
- "Exposed wallets can link a post-quantum successor. The contract verifies the old ECDSA signature and the new ML-DSA key on-chain."
- "QDay Radar: know your exposure, then move before Q-Day."
