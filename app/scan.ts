// SPDX-License-Identifier: Apache-2.0
// Quantum-exposure scan for a classical EVM address.
//
// Why "sent a transaction" == "exposed": an EOA's address is a hash of its
// secp256k1 public key, so an unused address hides the key. The first signed
// transaction publishes a signature from which anyone can recover the public
// key. Shor's algorithm on a large quantum computer turns that public key into
// the private key. Funds left on such an address are "harvest now, forge later".
import { keccak256, toBytes } from "viem";
import { CHAINS, type Chain } from "./chains.js";

export type ChainResult = {
  chain: string;
  chainId: number;
  nonce: number; // outgoing txs from this address (EOA)
  balanceWei: string;
  balance: number; // in native units, rounded for display
  symbol: string;
  kind: "eoa" | "eoa-7702" | "contract";
  exposed: boolean;
  error?: string;
};

export type ScanReport = {
  address: `0x${string}`;
  scannedAt: string;
  chains: ChainResult[];
  chainsScanned: number; // bitmask
  exposedMask: number; // bitmask
  risk: 0 | 1 | 2 | 3;
  riskLabel: string;
  advice: string;
  evidenceHash: `0x${string}`;
};

export type RpcFn = (chain: Chain, method: string, params: unknown[]) => Promise<string>;

async function rpcOnce(url: string, chain: Chain, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${chain.name}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (body.error) throw new Error(`${chain.name}: ${body.error.message}`);
  if (typeof body.result !== "string") throw new Error(`${chain.name}: empty result`);
  return body.result;
}

/** Public RPCs rate-limit; try the primary, then each fallback. */
export const fetchRpc: RpcFn = async (chain, method, params) => {
  let last: unknown;
  for (const url of [chain.rpc, ...(chain.fallbacks ?? [])]) {
    try {
      return await rpcOnce(url, chain, method, params);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(`${chain.name}: all RPCs failed`);
};

export const isAddress = (a: string): a is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(a);

export function classify(code: string): ChainResult["kind"] {
  if (!code || code === "0x") return "eoa";
  // EIP-7702 delegation designator: the account is still controlled by its ECDSA key
  if (code.toLowerCase().startsWith("0xef0100")) return "eoa-7702";
  return "contract";
}

const LABELS = [
  "Not exposed: the public key has never been revealed on the scanned chains.",
  "Exposed, nothing at stake: the public key is public, but no funds sit on it.",
  "Exposed with funds: the public key is public and the address still holds assets.",
  "Highly exposed: public key revealed on several chains while holding assets.",
] as const;

const ADVICE = [
  "Keep it that way: receive-only use does not reveal the key. Plan a post-quantum account before your first send.",
  "Do not reuse this address for savings. New funds should go to a post-quantum protected account.",
  "Move long-term holdings to an account protected by ML-DSA (e.g. a QoreChain account with a registered ML-DSA-87 key) and link it here.",
  "Prioritise migration: this key is the kind of target a 'harvest now, forge later' attacker would queue first.",
] as const;

export function score(chains: ChainResult[]): { risk: 0 | 1 | 2 | 3; chainsScanned: number; exposedMask: number } {
  let chainsScanned = 0;
  let exposedMask = 0;
  let fundedExposed = 0;
  chains.forEach((c, i) => {
    if (c.error) return;
    chainsScanned |= 1 << i;
    if (c.exposed) {
      exposedMask |= 1 << i;
      if (BigInt(c.balanceWei) > 0n) fundedExposed++;
    }
  });
  const risk: 0 | 1 | 2 | 3 = exposedMask === 0 ? 0 : fundedExposed === 0 ? 1 : fundedExposed >= 3 ? 3 : 2;
  return { risk, chainsScanned, exposedMask };
}

export function evidenceHash(address: string, chains: ChainResult[]): `0x${string}` {
  const canonical = JSON.stringify({
    address: address.toLowerCase(),
    chains: chains.map((c) => ({ id: c.chainId, nonce: c.nonce, balanceWei: c.balanceWei, kind: c.kind, err: !!c.error })),
  });
  return keccak256(toBytes(canonical));
}

export async function scanAddress(address: `0x${string}`, rpc: RpcFn = fetchRpc, chains: Chain[] = CHAINS): Promise<ScanReport> {
  const results = await Promise.all(
    chains.map(async (chain): Promise<ChainResult> => {
      try {
        const [nonceHex, balHex, code] = await Promise.all([
          rpc(chain, "eth_getTransactionCount", [address, "latest"]),
          rpc(chain, "eth_getBalance", [address, "latest"]),
          rpc(chain, "eth_getCode", [address, "latest"]),
        ]);
        const nonce = Number(BigInt(nonceHex));
        const wei = BigInt(balHex);
        const kind = classify(code);
        return {
          chain: chain.name,
          chainId: chain.id,
          nonce,
          balanceWei: wei.toString(),
          balance: Math.round(Number(wei / 10n ** 12n) / 1e6 * 1e6) / 1e6,
          symbol: chain.symbol,
          kind,
          // contracts have no private key to forge; EOAs and 7702-delegated EOAs do
          exposed: kind !== "contract" && nonce > 0,
        };
      } catch (e) {
        return { chain: chain.name, chainId: chain.id, nonce: 0, balanceWei: "0", balance: 0, symbol: chain.symbol, kind: "eoa", exposed: false, error: (e as Error).message };
      }
    }),
  );
  const { risk, chainsScanned, exposedMask } = score(results);
  return {
    address,
    scannedAt: new Date().toISOString(),
    chains: results,
    chainsScanned,
    exposedMask,
    risk,
    riskLabel: LABELS[risk],
    advice: ADVICE[risk],
    evidenceHash: evidenceHash(address, results),
  };
}

export function telegramText(r: ScanReport): string {
  const icon = ["🟢", "🟡", "🟠", "🔴"][r.risk];
  const lines = r.chains.map((c) =>
    c.error ? `▫️ ${c.chain}: unavailable` : `${c.exposed ? "⚠️" : "✅"} ${c.chain}: ${c.nonce} sent tx · ${c.balance} ${c.symbol}${c.kind === "contract" ? " (contract)" : ""}`,
  );
  return [`${icon} QDay Radar — ${r.address}`, r.riskLabel, "", ...lines, "", r.advice].join("\n");
}
