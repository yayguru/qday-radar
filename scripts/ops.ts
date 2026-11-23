// SPDX-License-Identifier: Apache-2.0
// Operator CLI for QDay Radar on QoreChain testnet.
//
//   npm run ops -- deploy                 register ML-DSA-87 key (once), open window, deploy QDayRadar
//   npm run ops -- attest 0xADDR          scan 7 chains, open window, record the scan on QoreChain
//   npm run ops -- link 0xLEGACY 0xSIG    link an exposed wallet to this PQ account
//   npm run ops -- status [0xADDR]        registry + PQC status
//
// Every EVM transaction here is admitted only because the sender has a registered
// ML-DSA-87 key and a window opened by a HYBRID-signed (secp256k1 + ML-DSA-87)
// native-lane transaction. Secrets come from .env.deployer and are never printed.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fetchPqcStatus } from "@qorechain/sdk";
import { account as unifiedAccount, network, open as openWindow, register as registerKey } from "./window.ts";
import { scanAddress, isAddress } from "../app/scan.ts";
import { RADAR_ABI, pqcKeyStatus, radarStats, radarStatus } from "../app/qore.ts";

const qore = defineChain({
  id: 9800,
  name: "QoreChain testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm-testnet.qore.host"] } },
});
const DEPLOY_FILE = new URL("../deployments/testnet.json", import.meta.url);

const pk = () => {
  const k = process.env.PRIVATE_KEY?.trim() as Hex | undefined;
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("PRIVATE_KEY missing in .env.deployer");
  return k;
};
const pub = createPublicClient({ chain: qore, transport: http() });
const wallet = () => createWalletClient({ chain: qore, transport: http(), account: privateKeyToAccount(pk()) });
const radar = (): Hex => {
  if (process.env.RADAR_ADDRESS && isAddress(process.env.RADAR_ADDRESS)) return process.env.RADAR_ADDRESS;
  if (existsSync(DEPLOY_FILE)) {
    const a = JSON.parse(readFileSync(DEPLOY_FILE, "utf8")).QDayRadar as string;
    if (isAddress(a)) return a;
  }
  throw new Error("No deployment: run `npm run ops -- deploy` first");
};

async function ensureKeyAndWindow() {
  const acc = await unifiedAccount();
  const st = await fetchPqcStatus({ rest: network().rest, address: acc.cosmos });
  if (!st.registered) {
    console.log("registering ML-DSA-87 key…");
    await registerKey();
    await new Promise((r) => setTimeout(r, 7000));
  }
  console.log("opening EVM window (hybrid-signed native tx)…");
  await openWindow();
  await new Promise((r) => setTimeout(r, 7000));
}

async function deploy() {
  await ensureKeyAndWindow();
  const out = execFileSync(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", "qorechain_testnet", "--broadcast", "--slow"],
    { env: process.env, encoding: "utf8" },
  );
  const m = out.match(/QDayRadar:\s*(0x[0-9a-fA-F]{40})/);
  if (!m) throw new Error("deploy output did not include an address:\n" + out.slice(-2000));
  const acc = await unifiedAccount();
  const info = { network: "qorechain-diana", evmChainId: 9800, QDayRadar: m[1], deployer: wallet().account.address, deployerNative: acc.cosmos, at: new Date().toISOString() };
  execFileSync("mkdir", ["-p", new URL("../deployments", import.meta.url).pathname]);
  writeFileSync(DEPLOY_FILE, JSON.stringify(info, null, 2) + "\n");
  console.log(JSON.stringify(info, null, 2));
}

async function attest(addr: string) {
  if (!isAddress(addr)) throw new Error("usage: attest 0xADDRESS");
  const r = await scanAddress(addr);
  console.log(`scan: risk ${r.risk} (${r.riskLabel}) scanned=${r.chainsScanned} exposed=${r.exposedMask}`);
  await ensureKeyAndWindow();
  const hash = await wallet().writeContract({
    address: radar(), abi: RADAR_ABI, functionName: "attestScan",
    args: [addr, r.chainsScanned, r.exposedMask, r.risk, r.evidenceHash],
  });
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`attestScan tx ${hash} status=${rc.status} block=${rc.blockNumber}`);
}

async function link(legacy: string, sig: string) {
  if (!isAddress(legacy) || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new Error("usage: link 0xLEGACY 0xSIGNATURE(65 bytes)");
  await ensureKeyAndWindow();
  const hash = await wallet().writeContract({ address: radar(), abi: RADAR_ABI, functionName: "linkSuccessor", args: [legacy, sig as Hex] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`linkSuccessor tx ${hash} status=${rc.status}`);
}

async function status(addr?: string) {
  const me = wallet().account.address;
  console.log("operator", me, await pqcKeyStatus(me));
  let r: Hex | undefined;
  try { r = radar(); } catch { console.log("registry: not deployed"); return; }
  console.log("registry", r, await radarStats(r));
  if (addr && isAddress(addr)) console.log(addr, await radarStatus(r, addr));
}

const [cmd, a1, a2] = process.argv.slice(2);
const table: Record<string, () => Promise<void>> = {
  deploy, attest: () => attest(a1 ?? ""), link: () => link(a1 ?? "", a2 ?? ""), status: () => status(a1),
};
(table[cmd ?? "status"] ?? (async () => { throw new Error("commands: deploy | attest | link | status"); }))().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
