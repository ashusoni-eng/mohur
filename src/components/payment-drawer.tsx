"use client";
import { useEffect, useState } from "react";
import { ExternalLink, MailSearch } from "lucide-react";
import type { Mail, Payment, PaymentEvent } from "@/lib/types";
import { api, fmtFull, fmtTime, message } from "@/lib/client";
import { inr } from "@/lib/money";
import { useApi, useLive } from "./live";
import { Button, CopyButton, Dialog, LinkButton, Skeleton, StatusPill, useToast } from "./ui";

type Detail = { payment: Payment; events: PaymentEvent[]; mail: Mail | null };

export function PaymentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return <Dialog open={!!id} onClose={onClose} title="Payment" side>{id && <Body key={id} id={id} />}</Dialog>;
}

function Body({ id }: { id: string }) {
  const { data, error } = useApi<Detail>(`/api/payments/${id}`);
  if (error && !data) return <p className="p-6 text-carnelian">{error}</p>;
  if (!data) return <div className="space-y-4 p-6"><Skeleton className="h-20" /><Skeleton className="h-60" /></div>;
  return <PaymentDetail {...data} />;
}

const DOT: Record<string, string> = { paid: "bg-jade", declined: "bg-carnelian", on_hold: "bg-[#b8780f]", expired: "bg-line-strong" };

export function PaymentDetail({ payment: p, events, mail }: Detail) {
  const rows: [string, React.ReactNode][] = [
    ["Payment ID", <span key="i" className="inline-flex items-center gap-1"><span className="font-mono">{p.id}</span><CopyButton text={p.id} className="-my-1 -mr-2" /></span>],
    ["For", p.title],
    ["Came from", { link: "Payment link", qr: "QR code", api: "API" }[p.source]],
  ];
  if (p.payable !== p.amount) rows.push(["Requested", <span key="a" className="num">{inr(p.amount)} <span className="text-ink-3">+ {p.payable - p.amount} paise to identify it</span></span>]);
  if (p.customer_name) rows.push(["Customer", p.customer_name]);
  if (p.customer_contact) rows.push(["Contact", p.customer_contact]);
  if (p.reference) rows.push(["Your reference", p.reference]);
  if (p.payer_name) rows.push(["Paid by", p.payer_name]);
  if (p.payer_vpa) rows.push(["Payer UPI ID", p.payer_vpa]);
  if (p.utr) rows.push(["UTR", <span key="u" className="font-mono">{p.utr}</span>]);
  if (p.customer_utr && p.customer_utr !== p.utr) rows.push(["UTR given by customer", <span key="c" className="font-mono">{p.customer_utr}</span>]);
  if (p.method && p.status === "paid") rows.push(["Verified by", { email: "Bank email", sms: "Bank SMS", utr: "UTR match", manual: "You" }[p.method]]);
  if (p.decision_note) rows.push(["Note", p.decision_note]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-6">
        <p className="num text-[40px] font-semibold leading-none tracking-[-0.02em]">{inr(p.payable)}</p>
        <StatusPill status={p.status} />
      </div>
      <dl className="border-y border-line px-6 py-2">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-6 py-2"><dt className="shrink-0 text-ink-3">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v}</dd></div>)}
      </dl>
      {mail && (
        <div className="mx-6 mt-5 rounded-[10px] bg-jade-wash p-4 text-[14px]">
          <p className="font-semibold text-[#125a40]">{mail.source === "sms" ? "Bank SMS" : "Bank email"} that confirmed it</p>
          <p className="mt-1 text-ink-2">{mail.excerpt}</p>
          <p className="mt-2 break-all text-[13px] text-ink-3">{mail.from_addr} · {fmtFull(mail.received_at)}</p>
        </div>
      )}
      <div className="flex-1 px-6 py-6">
        <h3 className="mb-4 font-display text-[17px]">Timeline</h3>
        <ol>
          {events.map((e, i) => (
            <li key={e.id} className="relative pb-5 pl-6 last:pb-0">
              {i < events.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-line-strong" />}
              <i className={`absolute left-0 top-[7px] h-[9px] w-[9px] rounded-full ${DOT[e.type] ?? "bg-lapis"}`} />
              <p className="font-medium leading-snug">{e.detail || e.type}</p>
              <p className="num text-[13px] text-ink-3">{fmtFull(e.at)}</p>
            </li>
          ))}
        </ol>
      </div>
      {p.status !== "paid" && p.status !== "declined" && <CheckMail p={p} />}
      <Decide p={p} />
    </div>
  );
}

type Alert = { subject: string; at: number; outcome: string; reason: string; amount: number | null; paymentId: string | null };
type Checked = { read: number; confirmed: string[]; alerts: Alert[]; payment: Payment };

/** Reads Gmail again from just before this payment was created, and says what it found. */
function CheckMail({ p }: { p: Payment }) {
  const live = useLive();
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Checked | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  if (!live?.mail) return null;
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const x = await api<Checked>(`/api/payments/${p.id}/check-mail`, "POST", {});
      setR(x);
      if (x.payment.status === "paid") toast(`${inr(p.payable)} confirmed from your mail`);
    } catch (e) { setErr(message(e)); }
    setBusy(false);
  };
  const near = r?.alerts.filter((a) => a.amount === p.payable || a.amount === null) ?? [];
  const rest = r?.alerts.filter((a) => !near.includes(a)) ?? [];
  return (
    <div className="border-t border-line px-6 py-4">
      <Button variant="quiet" className="w-full" busy={busy} onClick={go}>{!busy && <MailSearch size={17} />}{busy ? "Reading Gmail" : "Check mail again"}</Button>
      {err && <p role="alert" className="mt-3 text-[14px] text-carnelian">{err}</p>}
      {r && r.payment.status !== "paid" && !busy && (
        <div className="mt-3 text-[14px]" aria-live="polite">
          <p className="num text-ink-2">Read {r.read} email{r.read === 1 ? "" : "s"} since {fmtTime(p.created_at)}. {r.alerts.length === 0 ? "None is a credit alert from your bank." : `${r.alerts.length} from your bank, none of which confirms this payment.`}</p>
          {[...near, ...rest].slice(0, 5).map((a, i) => (
            <div key={i} className="mt-2.5 rounded-[9px] bg-sunk px-3.5 py-2.5">
              <p className="num flex justify-between gap-3 font-semibold"><span className="truncate">{a.subject}</span>{a.amount !== null && <span>{inr(a.amount)}</span>}</p>
              <p className="num mt-0.5 text-ink-2">{a.outcome === "matched" ? `Confirmed ${a.paymentId}` : a.reason} · {fmtTime(a.at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Decide({ p }: { p: Payment }) {
  const [mode, setMode] = useState<"approve" | "decline" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => setMode(null), [p.status]);
  const open = p.status === "pending" || p.status === "verifying";
  if (p.status === "paid")
    return null;

  const go = async () => {
    setBusy(true);
    try {
      await api(`/api/payments/${p.id}/${mode}`, "POST", { note });
      toast(mode === "approve" ? `${inr(p.payable)} marked as paid` : "Payment declined");
      setMode(null);
    } catch (e) { toast(message(e), true); }
    setBusy(false);
  };
  return (
    <div className="sticky bottom-0 border-t border-line bg-paper px-6 py-4">
      {mode === null ? (
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => setMode("approve")}>Approve</Button>
          {p.status !== "declined" && <Button variant="danger" className="flex-1" onClick={() => setMode("decline")}>Decline</Button>}
          {open && <LinkButton variant="quiet" href={`/checkout/${p.id}`} target="_blank" rel="noreferrer" aria-label="Open checkout page" title="Open checkout page"><ExternalLink size={17} /></LinkButton>}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <p className="font-semibold">{mode === "approve" ? `Mark ${inr(p.payable)} as paid?` : "Decline this payment?"}</p>
          <p className="mb-3 mt-0.5 text-[14px] text-ink-3">{mode === "approve" ? "Check your bank statement first. This cannot be undone." : "The customer will see that it was declined. You can still approve it later."}</p>
          <input className="field" aria-label="Note" placeholder="Note for your records" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <div className="mt-3 flex gap-3">
            <Button type="submit" busy={busy} variant={mode === "approve" ? "primary" : "danger"} className="flex-1">{mode === "approve" ? "Mark as paid" : "Decline payment"}</Button>
            <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
