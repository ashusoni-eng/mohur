import { all, get, run } from "./db";
import { publish, subscribe, topics } from "./bus";
import { hasLivePayments, sweep } from "./payments";
import { deliverDue } from "./webhooks";
import { AuthFailure, runImap } from "./mail/imap";
import { rescan } from "./mail/rescan";
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
  private reread = new Map<string, number>();

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
    for (const a of all<MailAccount>("SELECT * FROM mail_accounts WHERE status!='error'")) this.listen(a.merchant_id);
  }

  private tick() {
    try { sweep(); } catch (e) { console.error("[mohur] sweep", e); }
    this.rereadHeld();
    if (this.delivering) return;
    this.delivering = true;
    deliverDue().catch((e) => console.error("[mohur] webhooks", e)).finally(() => { this.delivering = false; });
  }

  /**
   * A customer says they paid and no alert has come. Read the mailbox again when the payment goes on
   * hold, then every two minutes for the first twenty, in case the alert was filtered away or passed over.
   */
  private rereadHeld(now = Date.now()) {
    const due = all<{ merchant_id: string; oldest: number; newest: number }>(
      `SELECT p.merchant_id, MIN(p.created_at) oldest, MAX(p.held_at) newest FROM payments p JOIN mail_accounts a ON a.merchant_id=p.merchant_id AND a.status='live'
       WHERE p.status='on_hold' AND p.claimed_at IS NOT NULL AND p.held_at>? GROUP BY p.merchant_id`, now - 20 * 60_000,
    );
    for (const d of due) {
      const last = this.reread.get(d.merchant_id) ?? 0;
      if (last > d.newest && now - last < 2 * 60_000) continue;
      this.reread.set(d.merchant_id, now);
      rescan(d.merchant_id, d.oldest - 60_000).catch((e) => console.error("[mohur] re-read", e instanceof Error ? e.message : e));
    }
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
