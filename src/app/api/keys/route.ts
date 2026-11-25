import { body, json, merchantRoute } from "@/lib/server/http";
import { all, run } from "@/lib/server/db";
import { newSlug, randomToken, sha256 } from "@/lib/server/crypto";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((_r, m) => json({ rows: all("SELECT id, label, prefix, created_at, last_used_at FROM api_keys WHERE merchant_id=? ORDER BY created_at DESC", m.id) }));
export const POST = merchantRoute(async (req, m) => {
  const { label } = await body(req, S.apiKey);
  const key = "mhr_" + randomToken(30);
  run("INSERT INTO api_keys (id, merchant_id, label, prefix, key_hash, created_at) VALUES (?,?,?,?,?,?)", "key_" + newSlug(12), m.id, label, key.slice(0, 10), sha256(key), Date.now());
  return json({ key }, 201);
});
