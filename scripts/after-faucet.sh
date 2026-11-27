#!/usr/bin/env bash
# One command after the faucet: deploy QDayRadar on QoreChain testnet (qorechain-diana, chain 9800),
# make the hybrid-signed window tx, attest one scan, point the live worker at the registry,
# and write submission/testnet-proof.md. TESTNET ONLY. Keys stay in .env.deployer (never printed).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
ADDR=0xD0FaB2667Be5B435c1D7Ea7010658a3621153d53
RPC=https://evm-testnet.qore.host
chain=$(curl -s -m 15 -X POST $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["result"],16))')
[ "$chain" = "9800" ] || { echo "RPC is not QoreChain testnet (chain $chain), abort"; exit 1; }
bal=$(curl -s -m 15 -X POST $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$ADDR\",\"latest\"]}" | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["result"],16)/1e18)')
echo "deployer balance: $bal QOR (testnet)"
python3 -c "import sys; sys.exit(0 if $bal >= 1 else 1)" || { echo "need >= 1 test QOR from https://dashboard.qorechain.io/faucet to $ADDR"; exit 2; }
LOG=submission/testnet-run.log; : > $LOG
echo "== deploy (registers ML-DSA-87 key + opens hybrid-signed EVM window) ==" | tee -a $LOG
npm run -s ops -- deploy 2>&1 | grep -v -i -E "private|mnemonic|QRC1" | tee -a $LOG
RADAR=$(python3 -c 'import json;print(json.load(open("deployments/testnet.json"))["QDayRadar"])')
echo "== attest vitalik.eth scan ==" | tee -a $LOG
npm run -s ops -- attest 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 2>&1 | grep -v -i -E "private|mnemonic|QRC1" | tee -a $LOG
echo "== status ==" | tee -a $LOG
npm run -s ops -- status 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 2>&1 | tee -a $LOG
sed -i "s/^RADAR_ADDRESS = .*/RADAR_ADDRESS = \"$RADAR\"/" wrangler.toml
npx wrangler deploy 2>&1 | tail -3 | tee -a $LOG
hyb=$(grep -o 'opened: [^ ]*' $LOG | head -1 | cut -d' ' -f2 || true)
att=$(grep -o 'attestScan tx 0x[0-9a-fA-F]*' $LOG | head -1 | awk '{print $3}' || true)
cat > submission/testnet-proof.md <<MD
# QDay Radar — QoreChain testnet proof (qorechain-diana, EVM chain 9800)

- QDayRadar contract: \`$RADAR\`
- Deployer / attester: \`$ADDR\` (qor16ratyenmuk6rtswhafcpqev2xcs3202n9wsw3m)
- Hybrid-signed (secp256k1 + ML-DSA-87) window tx: \`${hyb:-see testnet-run.log}\`
- attestScan tx: \`${att:-see testnet-run.log}\`
- Live app now reads this registry: https://qday-radar.merjkerm.workers.dev
- Full log: submission/testnet-run.log
MD
cat submission/testnet-proof.md
echo "DONE. Next: re-record video (night-builds/video/rec_qd.py) and commit."
