import { NextResponse } from "next/server";
import { currentMerchant } from "@/lib/server/auth";
import { exchangeCode, readState } from "@/lib/server/mail/google";
import { encrypt } from "@/lib/server/crypto";
import { run } from "@/lib/server/db";
import { engine } from "@/lib/server/engine";
import { env } from "@/lib/server/env";
export async function GET(req: Request) {
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/app/configuration?${q}`);
  const u = new URL(req.url).searchParams;
  const m = await currentMerchant();
  // State must belong to the person signed in here, or someone could attach their mailbox to your account.
  if (!m || readState(u.get("state") ?? "") !== m.id) return back("error=" + encodeURIComponent("Google sign-in expired. Try again."));
  if (!u.get("code")) return back("error=" + encodeURIComponent("Google access was not granted"));
  try {
    const g = await exchangeCode(u.get("code")!);
    const now = Date.now();
    run(
      `INSERT INTO mail_accounts (merchant_id, kind, email, secret_enc, status, cursor_ms, connected_at) VALUES (?,'google',?,?,'connecting',?,?)
       ON CONFLICT(merchant_id) DO UPDATE SET kind='google', email=excluded.email, secret_enc=excluded.secret_enc, status='connecting', last_error=NULL, last_uid=NULL, uid_validity=NULL, cursor_ms=excluded.cursor_ms, connected_at=excluded.connected_at`,
      m.id, g.email, encrypt(g.refresh), now, now,
    );
    engine().listen(m.id);
    return back("connected=1");
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message : "Google sign-in failed"));
  }
}
