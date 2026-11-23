// SPDX-License-Identifier: Apache-2.0
// Read-only QoreChain testnet helpers (EVM lane, JSON-RPC).
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import { PQC_KEY_STATUS, QORE_TESTNET } from "./chains.js";

export const RADAR_ABI = parseAbi([
  "function status(address subject) view returns (bool scanned, uint32 exposedMask, uint8 risk, address pqAccount, bool successorStillProtected)",
  "function scanCount() view returns (uint256)",
  "function migrationCount() view returns (uint256)",
  "function migrationMessage(address legacy, address pqAccount) view returns (bytes32)",
  "function attestScan(address subject, uint32 chainsScanned, uint32 exposedMask, uint8 risk, bytes32 evidenceHash)",
  "function linkSuccessor(address legacy, bytes sig)",
  "function setAttester(address a, bool allowed)",
]);
export const PQC_ABI = parseAbi([
  "function pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey)",
]);

async function ethCall(to: string, data: `0x${string}`, rpc = QORE_TESTNET.rpc): Promise<`0x${string}`> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const body = (await res.json()) as { result?: `0x${string}`; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result ?? "0x";
}

export async function pqcKeyStatus(account: `0x${string}`) {
  const out = await ethCall(PQC_KEY_STATUS, encodeFunctionData({ abi: PQC_ABI, functionName: "pqcKeyStatus", args: [account] }));
  const [registered, algorithmId, pubkey] = decodeFunctionResult({ abi: PQC_ABI, functionName: "pqcKeyStatus", data: out });
  return { registered, algorithmId, pubkeyBytes: (pubkey.length - 2) / 2 };
}

export async function radarStatus(radar: `0x${string}`, subject: `0x${string}`) {
  const out = await ethCall(radar, encodeFunctionData({ abi: RADAR_ABI, functionName: "status", args: [subject] }));
  const [scanned, exposedMask, risk, pqAccount, successorStillProtected] = decodeFunctionResult({ abi: RADAR_ABI, functionName: "status", data: out });
  return { scanned, exposedMask, risk, pqAccount, successorStillProtected };
}

export async function radarStats(radar: `0x${string}`) {
  const [s, m] = await Promise.all([
    ethCall(radar, encodeFunctionData({ abi: RADAR_ABI, functionName: "scanCount" })),
    ethCall(radar, encodeFunctionData({ abi: RADAR_ABI, functionName: "migrationCount" })),
  ]);
  return { scans: Number(BigInt(s)), migrations: Number(BigInt(m)) };
}

export async function migrationMessage(radar: `0x${string}`, legacy: `0x${string}`, pq: `0x${string}`) {
  return ethCall(radar, encodeFunctionData({ abi: RADAR_ABI, functionName: "migrationMessage", args: [legacy, pq] }));
}
