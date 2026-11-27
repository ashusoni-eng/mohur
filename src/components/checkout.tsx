"use client";
import { useEffect, useState } from "react";
import { Ban, Check, ChevronDown, Clock, FlaskConical, Hourglass, Printer, WifiOff } from "lucide-react";
import type { CheckoutView } from "@/lib/server/views";
import { fmtFull } from "@/lib/client";
import { inr } from "@/lib/money";
import { Reeding } from "./brand";
import { Folio } from "./public-frame";
import { Qr } from "./qr";
import { useCheckout, useNow } from "./use-checkout";
import { Button, CopyButton, Field } from "./ui";

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function Checkout({ initial }: { initial: CheckoutView }) {
  const { v, act, busy, error, offline } = useCheckout(initial);
  const now = useNow(v);
  const extra = v.payable - v.amount;
  return (
    <Folio
      brand={v.brand}
      left={
        <>
          <div>
            <p className="text-white/75">{v.business}</p>
            <h1 className="mt-2 break-words font-display text-[28px] leading-[1.15]">{v.title}</h1>
          </div>
          <div>
            <p className="num text-[46px] font-semibold leading-none tracking-[-0.025em] text-brass-lt">{inr(v.payable)}</p>
            {extra > 0 && <p className="num mt-3 text-[14px] leading-snug text-white/80">{inr(v.amount)} plus {extra} paise. The paise mark this payment as yours, so pay the exact amount.</p>}
            <p className="mt-4 flex items-center gap-2 text-[14px] text-white/75">Payment ID <span className="font-mono text-white">{v.id}</span></p>
          </div>
        </>
      }
      right={
        <div aria-live="polite">
          {v.test && <TestBar v={v} act={act} busy={busy} />}
          {offline && <p className="mb-4 flex items-center gap-2 rounded-[9px] bg-amber-wash px-4 py-2.5 text-[14px] text-amber"><WifiOff size={16} />You are offline. We will update when you reconnect.</p>}
          {v.status === "pending" && <Scan v={v} now={now} busy={busy} onClaim={() => act("claim")} />}
          {v.status === "verifying" && <Verifying v={v} now={now} />}
          {v.status === "on_hold" && <Hold v={v} act={act} busy={busy} />}
          {v.status === "expired" && <Hold v={v} act={act} busy={busy} expired />}
          {v.status === "paid" && <Paid v={v} />}
          {v.status === "declined" && <End Icon={Ban} title="Payment declined">{v.business} could not confirm this payment. If money left your account, contact them with the payment ID.{v.support && <> Reach them at <b>{v.support}</b>.</>}</End>}
          {error && <p role="alert" className="mt-4 rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-[14px] text-carnelian">{error}</p>}
        </div>
      }
    />
  );
}

function Scan({ v, now, busy, onClaim }: { v: CheckoutView; now: number; busy: boolean; onClaim: () => void }) {
  const left = v.qrUntil - now;
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid aspect-square w-full max-w-[340px] place-items-center">
        <Reeding lit={Math.ceil((left / Math.max(1, v.qrUntil - v.createdAt)) * 60)} />
        {v.upi && <Qr {...v.upi.qr} className="w-[63%]" />}
        {v.test && <div className="grid aspect-square w-[63%] place-items-center rounded-[12px] border-2 border-dashed border-amber/60 bg-amber-wash p-6 text-center text-[14px] font-semibold text-amber">Test payment<br />No QR: nothing to pay</div>}
      </div>
      <p className="mt-4 text-center"><b className="font-semibold">{v.test ? "Use the test buttons above" : "Scan with any UPI app"}</b><span className="num block text-[14px] text-ink-3">Code closes in {clock(left)}</span></p>
      {v.upi && <a href={v.upi.uri} className="mt-5 hidden h-[52px] w-full items-center justify-center rounded-[9px] bg-emerald font-semibold text-white pointer-coarse:inline-flex">Open a UPI app</a>}
      {v.upi && <p className="mt-4 flex max-w-full items-center gap-1 text-[14px] text-ink-3"><span className="truncate">{v.upi.vpa}</span><CopyButton text={v.upi.vpa} /></p>}
      <Button variant="gold" size="lg" busy={busy} className="mt-4 w-full" onClick={onClaim}>I have paid</Button>
      <p className="mt-3 text-center text-[13px] text-ink-3">This page updates by itself when the bank confirms.</p>
      {v.bank && (
        <details className="group mt-5 w-full border-t border-line pt-4">
          <summary className="flex list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">Pay by bank transfer instead<ChevronDown size={18} className="text-ink-3 transition group-open:rotate-180" /></summary>
          <dl className="mt-3 text-[14px]">
            {([["Account name", v.bank.holder], ["Account number", v.bank.number], ["IFSC", v.bank.ifsc], ["Bank", v.bank.bank]] as const).filter(([, x]) => x).map(([k, x]) => <div key={k} className="flex items-center justify-between gap-4 py-1"><dt className="text-ink-3">{k}</dt><dd className="flex items-center gap-1 text-right font-medium">{x}<CopyButton text={x!} label="" className="!px-1" /></dd></div>)}
          </dl>
        </details>
      )}
    </div>
  );
}

/** Test payments carry no money, so the customer side can move them by hand. */
function TestBar({ v, act, busy }: { v: CheckoutView; act: (w: "simulate", d?: unknown) => Promise<boolean>; busy: boolean }) {
  const can = (s: string) => (s === "paid" || s === "declined" ? !["paid", "declined"].includes(v.status) : s === "on_hold" ? ["pending", "verifying"].includes(v.status) : ["pending", "verifying", "on_hold"].includes(v.status));
  const opts = (["paid", "on_hold", "declined", "expired"] as const).filter(can);
  return (
    <div className="mb-5 rounded-[12px] border border-amber/40 bg-amber-wash p-4 text-amber">
      <p className="flex items-center gap-2 font-semibold"><FlaskConical size={17} />Test mode. No real money moves.</p>
      {opts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {opts.map((o) => <Button key={o} size="sm" variant="ghost" busy={busy} onClick={() => act("simulate", { outcome: o })}>Simulate {o.replace("_", " ")}</Button>)}
        </div>
      )}
    </div>
  );
}

function Verifying({ v, now }: { v: CheckoutView; now: number }) {
  const left = (v.verifyUntil ?? now) - now;
  const s = Math.max(0, Math.ceil(left / 1000));
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative grid aspect-square w-full max-w-[300px] place-items-center">
        <Reeding lit={Math.ceil((left / (v.verifySeconds * 1000)) * 60)} tone="#b8934a" />
        <div><p className="num text-[84px] font-semibold leading-none tracking-[-0.04em]">{s}</p><p className="mt-1 text-ink-3">second{s === 1 ? "" : "s"}</p></div>
      </div>
      <h2 className="mt-6 font-display text-[25px]">Waiting for the bank</h2>
      <p className="mt-1 max-w-[38ch] text-ink-3">Keep this page open. Most banks confirm a UPI payment within a few seconds.</p>
    </div>
  );
}

function Hold({ v, act, busy, expired }: { v: CheckoutView; act: (w: "claim" | "utr" | "simulate", d?: unknown) => Promise<boolean>; busy: boolean; expired?: boolean }) {
  const [utr, setUtr] = useState("");
  return (
    <div>
      <div className="flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${expired ? "bg-sunk text-ink-3" : "bg-amber-wash text-amber"}`}>{expired ? <Clock size={22} /> : <Hourglass size={22} />}</span>
        <div>
          <h2 className="font-display text-[26px] leading-tight">{expired ? "This payment expired" : "Your payment is on hold"}</h2>
          <p className="mt-1 text-ink-2">{expired ? "No payment was confirmed. If you did pay, enter your UTR below. Do not pay again." : "The bank has not confirmed it yet. If you paid, your money is safe: do not pay again. This page will update when it arrives."}</p>
        </div>
      </div>
      <div className="mt-6 rounded-[12px] bg-sunk p-5 text-center">
        <p className="text-[14px] text-ink-3">Save your payment ID</p>
        <p className="mt-1 select-all break-all font-mono text-[28px] font-semibold tracking-[0.1em]">{v.id}</p>
        <CopyButton text={v.id} label="Copy payment ID" className="mt-1 hover:!bg-line" />
      </div>
      {v.hasUtr ? (
        <p className="mt-5 flex items-start gap-2.5 text-ink-2"><Check size={18} className="mt-0.5 shrink-0 text-jade" />We have your UTR. The payment will be confirmed as soon as it matches a bank credit.</p>
      ) : (
        <form className="mt-6" onSubmit={(e) => { e.preventDefault(); void act("utr", { utr }); }}>
          <Field label="Have the UTR? Confirm faster" hint="The 12-digit UPI reference on your app's receipt.">
            {(a) => <div className="flex gap-3"><input {...a} className="field font-mono" inputMode="text" maxLength={22} autoComplete="off" value={utr} onChange={(e) => setUtr(e.target.value)} /><Button type="submit" busy={busy} disabled={utr.trim().length < 12}>Submit</Button></div>}
          </Field>
        </form>
      )}
      <p className="mt-6 border-t border-line pt-5 text-[14px] text-ink-3">Check this payment any time at <a className="font-semibold text-emerald underline underline-offset-4" href={`/status?id=${v.id}`}>the status page</a>.{v.support && <> Need help? Contact {v.business} at <b className="text-ink">{v.support}</b>.</>}</p>
    </div>
  );
}

function Paid({ v }: { v: CheckoutView }) {
  const [left, setLeft] = useState(6);
  useEffect(() => {
    if (!v.redirectUrl) return;
    if (left <= 0) {
      const u = new URL(v.redirectUrl);
      u.searchParams.set("payment_id", v.id);
      location.href = u.toString();
      return;
    }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, v.redirectUrl, v.id]);
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative grid aspect-square w-full max-w-[260px] place-items-center">
        <span className="absolute inset-6 rounded-full border-2 border-brass-mid" style={{ animation: "ripple 1.1s .35s var(--ease-coin) both" }} />
        <Reeding lit={60} tone="#b8934a" />
        <div className="strike shine grid h-[72%] w-[72%] place-items-center rounded-full text-deep shadow-[inset_0_0_0_6px_rgb(255_255_255/.28)]"><Check size={88} strokeWidth={1.6} /></div>
      </div>
      <h2 className="mt-6 font-display text-[30px] leading-tight">Payment received</h2>
      <p className="num mt-1 text-ink-3">{inr(v.payable)} to {v.business}{v.settledAt && <><br />{fmtFull(v.settledAt)}</>}</p>
      <dl className="mt-6 w-full border-y border-line py-2 text-left">
        <div className="flex justify-between gap-4 py-1.5"><dt className="text-ink-3">Payment ID</dt><dd className="flex items-center gap-1 font-mono">{v.id}<CopyButton text={v.id} className="-my-1 -mr-2" /></dd></div>
        {v.utr && <div className="flex justify-between gap-4 py-1.5"><dt className="text-ink-3">UTR</dt><dd className="font-mono">{v.utr}</dd></div>}
      </dl>
      {v.redirectUrl ? <p className="num mt-4 text-[14px] text-ink-3">Taking you back in {left}s</p> : <Button variant="ghost" className="no-print mt-4" onClick={() => window.print()}><Printer size={16} />Print receipt</Button>}
    </div>
  );
}

function End({ Icon, title, children }: { Icon: typeof Ban; title: string; children: React.ReactNode }) {
  return <div className="grid min-h-[300px] content-center justify-items-center text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-carnelian-wash text-carnelian"><Icon size={28} /></span><h2 className="mt-5 font-display text-[27px]">{title}</h2><p className="mt-2 max-w-[40ch] text-ink-2">{children}</p></div>;
}
