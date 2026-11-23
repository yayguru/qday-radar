// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { scanAddress, classify, score, evidenceHash, telegramText, type RpcFn, type ChainResult } from "./scan.js";
import { CHAINS } from "./chains.js";

const A = "0x1111111111111111111111111111111111111111" as const;

const fake = (table: Record<string, { nonce: number; bal: bigint; code?: string; fail?: boolean }>): RpcFn =>
  async (chain, method) => {
    const row = table[chain.name] ?? { nonce: 0, bal: 0n };
    if (row.fail) throw new Error(`${chain.name}: down`);
    if (method === "eth_getTransactionCount") return "0x" + row.nonce.toString(16);
    if (method === "eth_getBalance") return "0x" + row.bal.toString(16);
    return row.code ?? "0x";
  };

describe("classify", () => {
  it("detects EOAs, 7702 delegations and contracts", () => {
    expect(classify("0x")).toBe("eoa");
    expect(classify("0xef0100" + "ab".repeat(20))).toBe("eoa-7702");
    expect(classify("0x6080604052")).toBe("contract");
  });
});

describe("scanAddress", () => {
  it("fresh address is not exposed", async () => {
    const r = await scanAddress(A, fake({}));
    expect(r.risk).toBe(0);
    expect(r.exposedMask).toBe(0);
    expect(r.chainsScanned).toBe((1 << CHAINS.length) - 1);
  });

  it("sent tx but empty -> risk 1", async () => {
    const r = await scanAddress(A, fake({ Base: { nonce: 3, bal: 0n } }));
    expect(r.risk).toBe(1);
    expect(r.exposedMask).toBe(1 << 1);
  });

  it("sent tx with funds -> risk 2; on 3+ chains -> risk 3", async () => {
    const one = await scanAddress(A, fake({ Ethereum: { nonce: 5, bal: 10n ** 18n } }));
    expect(one.risk).toBe(2);
    const many = await scanAddress(A, fake({
      Ethereum: { nonce: 5, bal: 1n }, Base: { nonce: 1, bal: 1n }, Celo: { nonce: 9, bal: 1n },
    }));
    expect(many.risk).toBe(3);
  });

  it("smart contract wallets are not ECDSA-exposed, 7702 EOAs are", async () => {
    const r = await scanAddress(A, fake({
      Ethereum: { nonce: 1, bal: 5n, code: "0x6080" },
      Base: { nonce: 2, bal: 5n, code: "0xef0100" + "cd".repeat(20) },
    }));
    expect(r.chains[0].exposed).toBe(false);
    expect(r.chains[1].exposed).toBe(true);
    expect(r.exposedMask).toBe(2);
  });

  it("a failing RPC is reported and excluded from the scanned mask", async () => {
    const r = await scanAddress(A, fake({ Polygon: { nonce: 0, bal: 0n, fail: true } }));
    const i = CHAINS.findIndex((c) => c.name === "Polygon");
    expect(r.chains[i].error).toMatch(/down/);
    expect(r.chainsScanned & (1 << i)).toBe(0);
  });

  it("exposed mask is always a subset of scanned mask (contract invariant)", async () => {
    const r = await scanAddress(A, fake({ Ethereum: { nonce: 1, bal: 1n }, Polygon: { nonce: 1, bal: 1n, fail: true } }));
    expect(r.exposedMask & ~r.chainsScanned).toBe(0);
  });
});

describe("evidence", () => {
  const rows: ChainResult[] = [{ chain: "Ethereum", chainId: 1, nonce: 1, balanceWei: "5", balance: 0, symbol: "ETH", kind: "eoa", exposed: true }];
  it("is deterministic and address-case-insensitive", () => {
    expect(evidenceHash(A, rows)).toBe(evidenceHash(A.toUpperCase().replace("0X", "0x"), rows));
    expect(evidenceHash(A, rows)).not.toBe(evidenceHash(A, [{ ...rows[0], nonce: 2 }]));
  });
  it("score ignores errored chains", () => {
    expect(score([{ ...rows[0], error: "x" }]).risk).toBe(0);
  });
  it("telegram text mentions risk and chains", async () => {
    const r = await scanAddress(A, fake({ Ethereum: { nonce: 5, bal: 10n ** 18n } }));
    const t = telegramText(r);
    expect(t).toContain("QDay Radar");
    expect(t).toContain("Ethereum: 5 sent tx");
  });
});
