// SPDX-License-Identifier: Apache-2.0
// Cloudflare Worker: web UI + JSON API + optional Telegram bot.
import { isAddress, scanAddress, telegramText } from "./scan.js";
import { migrationMessage, pqcKeyStatus, radarStats, radarStatus } from "./qore.js";
import { CHAINS, QORE_TESTNET } from "./chains.js";
import { PAGE } from "./ui.js";

export interface Env {
  RADAR_ADDRESS?: string; // QDayRadar contract on QoreChain testnet
  TG_BOT_TOKEN?: string; // optional Telegram bot
  TG_WEBHOOK_SECRET?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" },
  });

const radarOf = (env: Env) => (env.RADAR_ADDRESS && isAddress(env.RADAR_ADDRESS) ? env.RADAR_ADDRESS : undefined);

async function tgSend(env: Env, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

export async function handleTelegram(env: Env, update: { message?: { chat: { id: number }; text?: string } }) {
  const msg = update.message;
  if (!msg?.text) return;
  const parts = msg.text.trim().split(/\s+/);
  const cmd = parts[0].replace(/@.*$/, "");
  const arg = parts[1] ?? (isAddress(parts[0]) ? parts[0] : "");
  if (cmd === "/start" || cmd === "/help") {
    await tgSend(env, msg.chat.id, "Send /check 0xYourAddress — I tell you if a quantum computer could one day forge your wallet's signatures, across 7 EVM chains, and whether it has a post-quantum successor on QoreChain.");
    return;
  }
  if ((cmd === "/check" || isAddress(cmd)) && isAddress(arg)) {
    const r = await scanAddress(arg);
    let tail = "";
    const radar = radarOf(env);
    if (radar) {
      try {
        const s = await radarStatus(radar, arg);
        tail = s.pqAccount !== "0x0000000000000000000000000000000000000000"
          ? `\n\n🛡 Linked to post-quantum account ${s.pqAccount} on QoreChain (${s.successorStillProtected ? "ML-DSA key active" : "key NOT active"})`
          : "\n\n⏳ No post-quantum successor linked on QoreChain yet.";
      } catch { /* registry unavailable */ }
    }
    await tgSend(env, msg.chat.id, telegramText(r) + tail);
    return;
  }
  await tgSend(env, msg.chat.id, "Usage: /check 0x… (an EVM address)");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === "/" || p === "/index.html") {
        return new Response(PAGE(radarOf(env) ?? ""), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (p === "/api/health") return json({ ok: true, chains: CHAINS.map((c) => c.name), qore: QORE_TESTNET.name, radar: radarOf(env) ?? null });
      if (p === "/api/scan") {
        const a = url.searchParams.get("address") ?? "";
        if (!isAddress(a)) return json({ error: "address must be 0x + 40 hex chars" }, 400);
        return json(await scanAddress(a));
      }
      if (p === "/api/pqc") {
        const a = url.searchParams.get("address") ?? "";
        if (!isAddress(a)) return json({ error: "bad address" }, 400);
        return json({ address: a, ...(await pqcKeyStatus(a)) });
      }
      if (p === "/api/registry") {
        const radar = radarOf(env);
        if (!radar) return json({ deployed: false });
        const a = url.searchParams.get("address") ?? "";
        const stats = await radarStats(radar);
        if (!isAddress(a)) return json({ deployed: true, radar, ...stats });
        const s = await radarStatus(radar, a);
        return json({ deployed: true, radar, ...stats, subject: a, ...s });
      }
      if (p === "/api/migration-message") {
        const radar = radarOf(env);
        const legacy = url.searchParams.get("legacy") ?? "";
        const pq = url.searchParams.get("pq") ?? "";
        if (!radar || !isAddress(legacy) || !isAddress(pq)) return json({ error: "need deployed registry, legacy and pq" }, 400);
        return json({ hash: await migrationMessage(radar, legacy, pq) });
      }
      if (p.startsWith("/telegram/") && req.method === "POST") {
        if (!env.TG_BOT_TOKEN || p !== `/telegram/${env.TG_WEBHOOK_SECRET}`) return new Response("nope", { status: 403 });
        await handleTelegram(env, await req.json());
        return new Response("ok");
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  },
};
