import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run, tx } from "./db";
import { hashPassword, newSlug, randomToken, sha256, verifyPassword } from "./crypto";
import { AppError } from "./payments";
import { env } from "./env";
import type { Merchant } from "../types";

const COOKIE = "mohur_session";
const TTL = 14 * 24 * 3600_000;
const cols = "m.id, m.name, m.business, m.email, m.created_at";

export async function currentMerchant(): Promise<Merchant | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return get<Merchant>(`SELECT ${cols} FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.token_hash=? AND s.expires_at>?`, sha256(token), Date.now()) ?? null;
}

/** For pages. A layout's redirect does not stop its page from rendering, so each page checks too. */
export async function requireMerchant(): Promise<Merchant> {
  return (await currentMerchant()) ?? redirect("/login");
}

export async function startSession(merchantId: string) {
  const token = randomToken();
  const now = Date.now();
  run("DELETE FROM sessions WHERE expires_at<?", now);
  run("INSERT INTO sessions (token_hash, merchant_id, created_at, expires_at) VALUES (?,?,?,?)", sha256(token), merchantId, now, now + TTL);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/", maxAge: TTL / 1000 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash=?", sha256(token));
  jar.delete(COOKIE);
}

export async function signUp(i: { name: string; business: string; email: string; password: string }) {
  const hash = await hashPassword(i.password);
  return tx(() => {
    if (get("SELECT 1 FROM merchants WHERE email=?", i.email)) throw new AppError("An account with this email already exists. Sign in instead.", 409);
    const id = "mer_" + newSlug(14);
    run("INSERT INTO merchants (id, name, business, email, password_hash, created_at) VALUES (?,?,?,?,?,?)", id, i.name, i.business, i.email, hash, Date.now());
    run("INSERT INTO settings (merchant_id, payee_name) VALUES (?,?)", id, i.business);
    return id;
  });
}

// Burned on unknown emails so response time does not reveal who has an account.
const DECOY = hashPassword("decoy");

export async function signIn(email: string, password: string) {
  const m = get<{ id: string; password_hash: string }>("SELECT id, password_hash FROM merchants WHERE email=?", email);
  const ok = await verifyPassword(password, m?.password_hash ?? (await DECOY));
  if (!m || !ok) throw new AppError("Email or password is incorrect", 401);
  return m.id;
}

export async function changePassword(id: string, current: string, next: string) {
  const m = get<{ password_hash: string }>("SELECT password_hash FROM merchants WHERE id=?", id);
  if (!m || !(await verifyPassword(current, m.password_hash))) throw new AppError("Current password is incorrect", 401);
  const hash = await hashPassword(next);
  tx(() => {
    run("UPDATE merchants SET password_hash=? WHERE id=?", hash, id);
    run("DELETE FROM sessions WHERE merchant_id=?", id);
  });
}
