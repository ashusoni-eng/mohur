import { get, run } from "./db";
import { encrypt, newSlug, randomToken } from "./crypto";
import { AppError, getSettings } from "./payments";
import { publish, topics } from "./bus";
import { env } from "./env";
import { ingestSms } from "./mail/ingest";
import { headersFor } from "./mail/sms";
import type { Device } from "../types";
import { z } from "zod";
import * as S from "../schemas";

const PAIR_MS = 10 * 60_000;

/** The pairing link carries the key, shown once as a QR code and scanned off the screen. */
export function startPairing(merchantId: string, label: string) {
  run("DELETE FROM devices WHERE merchant_id=? AND status='pairing'", merchantId);
  if (get<{ n: number }>("SELECT COUNT(*) n FROM devices WHERE merchant_id=?", merchantId)!.n >= 3) throw new AppError("You can pair up to 3 phones. Remove one first.");
  const id = "dev_" + newSlug(14);
  const key = randomToken(32);
  const until = Date.now() + PAIR_MS;
  run("INSERT INTO devices (id, merchant_id, label, secret_enc, pair_until, created_at) VALUES (?,?,?,?,?,?)", id, merchantId, label || "Phone", encrypt(key), until, Date.now());
  const server = env.phoneUrl;
  return { id, until, server, link: `mohur://pair?${new URLSearchParams({ s: server, d: id, k: key })}` };
}

export function hello(d: Device, b: z.infer<typeof S.deviceHello>) {
  const now = Date.now();
  run("UPDATE devices SET status='active', model=?, app_version=?, sms_ok=?, battery_ok=?, last_seen_at=? WHERE id=?", b.model, b.version, b.sms_ok ? 1 : 0, b.battery_ok ? 1 : 0, now, d.id);
  publish(topics.merchant(d.merchant_id));
  const s = getSettings(d.merchant_id);
  return {
    now, business: get<{ business: string }>("SELECT business FROM merchants WHERE id=?", d.merchant_id)!.business,
    bank: s.bank_name || null, headers: headersFor(s.bank_code, s.extra_headers.split(/[\s,]+/).filter(Boolean)),
  };
}

export function receive(d: Device, b: z.infer<typeof S.deviceSms>) {
  if (d.status !== "active") throw new AppError("Finish pairing first", 409);
  const now = Date.now();
  const results = b.items.map((i) => ({ id: i.id, ...ingestSms(d.merchant_id, { messageId: `sms:${i.id}`, sender: i.sender, body: i.body, receivedAt: now - i.age_ms }) }));
  run("UPDATE devices SET last_seen_at=?, last_sms_at=?, received=received+? WHERE id=?", now, now, results.length, d.id);
  publish(topics.merchant(d.merchant_id));
  return { now, results };
}

export function removeDevice(merchantId: string, id: string) {
  run("DELETE FROM devices WHERE id=? AND merchant_id=?", id, merchantId);
  publish(topics.merchant(merchantId));
}
