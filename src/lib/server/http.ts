import { NextResponse } from "next/server";
import { z } from "zod";
import { currentMerchant } from "./auth";
import { AppError, getPayment } from "./payments";
import { get, run } from "./db";
import { decrypt, hmac, safeEqual, sha256 } from "./crypto";
import { env } from "./env";
import type { Device, Merchant, Payment } from "../types";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

type Ctx<P> = { params: Promise<P> };

function fail(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message, code: e.code }, e.status);
  if (e instanceof z.ZodError) return json({ error: e.issues[0]?.message ?? "Check the form and try again", code: "invalid_request", field: e.issues[0]?.path.join(".") }, 400);
  if (e instanceof SyntaxError) return json({ error: "Body is not valid JSON", code: "invalid_request" }, 400);
  console.error("[mohur]", e);
  return json({ error: "Something went wrong on our side", code: "server_error" }, 500);
}

/** Cookies are ambient, so a state-changing request must come from our own pages. */
function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin") ?? "";
  const host = URL.canParse(origin) ? new URL(origin).host : null;
  if (!host || (host !== req.headers.get("host") && host !== new URL(env.appUrl).host)) throw new AppError("Request came from another site", 403, "forbidden");
}

export function merchantRoute<P = Record<string, never>>(fn: (req: Request, m: Merchant, params: P) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const m = await currentMerchant();
      if (!m) throw new AppError("Sign in to continue", 401, "unauthorized");
      return await fn(req, m, await ctx.params);
    } catch (e) { return fail(e); }
  };
}

export function publicRoute<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      return await fn(req, await ctx.params);
    } catch (e) { return fail(e); }
  };
}

export function apiRoute<P = Record<string, never>>(fn: (req: Request, merchantId: string, params: P) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const key = /^Bearer (mhr_\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
      const row = key && get<{ id: string; merchant_id: string }>("SELECT id, merchant_id FROM api_keys WHERE key_hash=?", sha256(key));
      if (!row) throw new AppError("Missing or unknown API key", 401, "unauthorized");
      limit(`api:${row.id}`, 120, 60_000);
      run("UPDATE api_keys SET last_used_at=? WHERE id=?", Date.now(), row.id);
      return await fn(req, row.merchant_id, await ctx.params);
    } catch (e) { return fail(e); }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}

/** Requests from a paired phone, signed with the key it was given by QR code. The key itself never travels. */
export function deviceRoute(fn: (d: Device, raw: string) => unknown) {
  return async (req: Request) => {
    try {
      const raw = await req.text();
      if (raw.length > 100_000) throw new AppError("Too large", 413);
      const id = req.headers.get("mohur-device") ?? "";
      const time = req.headers.get("mohur-time") ?? "";
      const sig = req.headers.get("mohur-signature") ?? "";
      const d = get<Device>("SELECT * FROM devices WHERE id=?", id);
      const want = d ? hmac(decrypt(d.secret_enc), `${req.method}\n${new URL(req.url).pathname}\n${time}\n${sha256(raw)}`) : "";
      if (!d || !safeEqual(sig, want)) {
        limit(`dev:${ip(req)}`, 60, 60_000);
        throw new AppError("This phone is not paired any more", 401, "unpaired");
      }
      // The phone learns our time from this reply and signs again, so a wrong clock cannot lock it out.
      if (!(Math.abs(Date.now() - Number(time)) < 5 * 60_000)) return json({ error: "Clock differs", code: "clock", now: Date.now() }, 409);
      limit(`device:${id}`, 120, 60_000);
      if (d.status === "pairing" && d.pair_until < Date.now()) throw new AppError("This pairing code has expired", 401, "unpaired");
      return json(await fn(d, raw));
    } catch (e) { return fail(e); }
  };
}

/* Fixed-window limiter. One process, so memory is enough. */
const g = globalThis as unknown as { __mohurHits?: Map<string, { n: number; until: number }> };
export function limit(key: string, max: number, windowMs: number) {
  const hits = (g.__mohurHits ??= new Map());
  const now = Date.now();
  if (hits.size > 20_000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.until < now) { hits.set(key, { n: 1, until: now + windowMs }); return; }
  if (++h.n > max) throw new AppError("Too many attempts. Wait a moment and try again.", 429, "rate_limited");
}

export const ip = (req: Request) => ipFrom(req.headers);
export function ipFrom(h: Headers) {
  // Without a trusted proxy the header is whatever the client typed.
  if (!env.trustProxy) return "direct";
  return h.get("x-forwarded-for")?.split(",").pop()?.trim() || "direct";
}

/**
 * A payment looked up by ID from a public page. Every public route goes through here, so a wrong
 * guess costs the same everywhere: 30 a minute per visitor. Polling a real payment is never slowed.
 */
export function publicPayment(h: Headers, id: string): Payment {
  const p = /^[0-9a-f]{10}$/i.test(id) ? getPayment(id) : undefined;
  if (p) return p;
  limit(`miss:${ipFrom(h)}`, 30, 60_000);
  throw new AppError("No payment with that ID", 404, "not_found");
}
