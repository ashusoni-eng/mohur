"use client";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { CheckoutView } from "@/lib/server/views";
import { api, fmtFull, message } from "@/lib/client";
import { inr } from "@/lib/money";
import { useCheckout } from "./use-checkout";
import { Button, LinkButton, StatusPill } from "./ui";

const SAY: Record<CheckoutView["status"], string> = {
  paid: "The bank confirmed this payment.",
  verifying: "Waiting for the bank to confirm.",
  pending: "Not paid yet.",
  on_hold: "The bank has not confirmed this yet. If you paid, do not pay again.",
  declined: "This payment could not be confirmed.",
  expired: "No payment was confirmed in time. If you did pay, submit your UTR.",
};

export function StatusLookup({ initialId }: { initialId: string }) {
  const first = initialId.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 10);
  const [id, setId] = useState(first);
  const [found, setFound] = useState<CheckoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const look = useCallback(async (x: string) => {
    setBusy(true); setError(null); setFound(null);
    try { setFound(await api<CheckoutView>(`/api/public/payments/${x}`)); } catch (e) { setError(message(e)); }
    setBusy(false);
  }, []);
  useEffect(() => { if (first.length === 10) void look(first); }, [first, look]);
  return (
    <div className="rise w-full max-w-[540px] rounded-[18px] bg-paper p-7 shadow-[0_30px_80px_-20px_rgb(0_0_0/.55)] sm:p-10">
      <h1 className="font-display text-[32px] leading-tight">Check a payment</h1>
      <p className="mt-1 text-ink-3">Enter the 10-character payment ID from your checkout page.</p>
      <form className="mt-6 flex gap-3 max-sm:flex-col" onSubmit={(e) => { e.preventDefault(); void look(id.toUpperCase()); }}>
        <input className="field !text-[20px] font-mono uppercase tracking-[0.14em]" aria-label="Payment ID" placeholder="7F3A9C21B0" maxLength={10} autoComplete="off" spellCheck={false} value={id} onChange={(e) => setId(e.target.value.replace(/[^0-9a-f]/gi, ""))} />
        <Button type="submit" size="lg" busy={busy} disabled={id.length !== 10}><Search size={17} />Check</Button>
      </form>
      <div aria-live="polite">
        {error && <p className="mt-6 rounded-[10px] bg-carnelian-wash px-5 py-4 text-carnelian">{error}. IDs use only 0 to 9 and A to F.</p>}
        {found && <Found key={found.id} initial={found} />}
      </div>
    </div>
  );
}

function Found({ initial }: { initial: CheckoutView }) {
  const { v } = useCheckout(initial);
  return (
    <div className="rise mt-7 border-t border-line pt-6">
      <div className="flex items-start justify-between gap-4"><p className="num text-[38px] font-semibold leading-none tracking-[-0.02em]">{inr(v.payable)}</p><StatusPill status={v.status} /></div>
      <p className="mt-4">{SAY[v.status]}</p>
      <dl className="mt-4">
        {([["Paid to", v.business], ["For", v.title], ["Started", fmtFull(v.createdAt)], ...(v.settledAt && v.status === "paid" ? [["Confirmed", fmtFull(v.settledAt)]] : []), ...(v.utr ? [["UTR", v.utr]] : [])] as string[][]).map(([k, x]) => <div key={k} className="flex justify-between gap-6 py-1.5"><dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{x}</dd></div>)}
      </dl>
      {["pending", "verifying", "on_hold", "expired"].includes(v.status) && <LinkButton variant="quiet" className="mt-4 w-full" href={`/checkout/${v.id}`}>{v.status === "pending" ? "Continue to pay" : v.hasUtr ? "Open payment page" : "Submit a UTR"}</LinkButton>}
    </div>
  );
}
