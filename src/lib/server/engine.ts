import { all, get, run } from "./db";
import { publish, subscribe, topics } from "./bus";
import { hasLivePayments, sweep } from "./payments";
import { deliverDue } from "./webhooks";
import { AuthFailure, runImap } from "./mail/imap";
import { runGoogle } from "./mail/google";
import type { MailAccount } from "../types";

/**
 * The long-lived half of Mohur: one mailbox listener per merchant, plus a one-second
 * tick that moves payments through their clocks and sends webhooks.
 */
class Engine {
  private runners = new Map<string, AbortController>();
  private timer?: NodeJS.Timeout;
  private delivering = false;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
    for (const a of all<MailAccount>("SELECT * FROM mail_accounts WHERE status!='error'")) this.listen(a.merchant_id);
  }

  private tick() {
    try { sweep(); } catch (e) { console.error("[mohur] sweep", e); }
    if (this.delivering) return;
    this.delivering = true;
    deliverDue().catch((e) => console.error("[mohur] webhooks", e)).finally(() => { this.delivering = false; });
  }

  /** (Re)start a merchant's mailbox listener, or stop it if the account is gone. */
  listen(merchantId: string) {
    this.runners.get(merchantId)?.abort();
    this.runners.delete(merchantId);
    if (!get("SELECT 1 FROM mail_accounts WHERE merchant_id=?", merchantId)) return;
    const ac = new AbortController();
    this.runners.set(merchantId, ac);
    void this.loop(merchantId, ac.signal);
  }

  private async loop(merchantId: string, signal: AbortSignal) {
    let fails = 0;
    const set = (status: string, error: string | null) => {
      if (signal.aborted) return;
      run("UPDATE mail_accounts SET status=?, last_error=? WHERE merchant_id=?", status, error, merchantId);
      publish(topics.merchant(merchantId));
    };
    while (!signal.aborted) {
      const acc = get<MailAccount>("SELECT * FROM mail_accounts WHERE merchant_id=?", merchantId);
      if (!acc) return;
      try {
        await (acc.kind === "google" ? runGoogle : runImap)(acc, {
          signal,
          // Gmail pushes new mail over IDLE; this poll is the safety net, tighter while someone is paying.
          idleMs: () => (hasLivePayments(merchantId) ? 4_000 : 30_000),
          wake: (fn) => subscribe(topics.wake, fn),
          onLive: () => { if (fails || acc.status !== "live") { fails = 0; acc.status = "live"; set("live", null); } },
        });
        return;
      } catch (e) {
        if (signal.aborted) return;
        const msg = e instanceof Error ? e.message : "Connection lost";
        if (e instanceof AuthFailure) return set("error", msg);
        set("retrying", msg);
        const wait = Math.min(60_000, 2_000 * 2 ** fails++);
        await new Promise<void>((res) => {
          const t = setTimeout(res, wait);
          signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
        });
      }
    }
  }
}

const g = globalThis as unknown as { __mohurEngine?: Engine };
export const engine = () => (g.__mohurEngine ??= new Engine());
