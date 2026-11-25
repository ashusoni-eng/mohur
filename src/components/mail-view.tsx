"use client";
import { useState } from "react";
import { Ban, Check, CircleHelp, Copy, MailSearch, MailX, ShieldAlert, type LucideIcon } from "lucide-react";
import type { Mail, MailOutcome, Payment } from "@/lib/types";
import { api, fmtFull, fmtTime, message } from "@/lib/client";
import { inr } from "@/lib/money";
import { useApi, useLive } from "./live";
import { Button, Dialog, Empty, Field, LinkButton, PageHead, Segmented, Skeleton, StatusPill, useToast } from "./ui";

type Row = Mail & { candidates: Payment[] };
const TABS = [["review", "Needs review"], ["matched", "Matched"], ["suspicious", "Suspicious"], ["ignored", "Ignored"], ["all", "All"]].map(([value, label]) => ({ value, label }));
const OUT: Record<MailOutcome, [string, string, LucideIcon]> = {
  matched: ["Matched", "bg-jade-wash text-[#125a40]", Check],
  unmatched: ["Unmatched", "bg-amber-wash text-amber", CircleHelp],
  ambiguous: ["Ambiguous", "bg-amber-wash text-amber", CircleHelp],
  duplicate: ["Duplicate", "bg-sunk text-ink-3", Copy],
  ignored: ["Ignored", "bg-sunk text-ink-3", MailX],
  dismissed: ["Dismissed", "bg-sunk text-ink-3", MailX],
  suspicious: ["Suspicious", "bg-carnelian-wash text-carnelian", ShieldAlert],
};

export function MailView() {
  const [tab, setTab] = useState("review");
  const { data, error, reload } = useApi<{ rows: Row[] }>(`/api/mails?tab=${tab}`);
  const live = useLive();
  const [pick, setPick] = useState<Row | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const r = await api<{ read: number; confirmed: string[]; alerts: unknown[] }>("/api/mails/check", "POST", {});
      toast(r.confirmed.length ? `${r.confirmed.length} payment${r.confirmed.length === 1 ? "" : "s"} confirmed` : `Read ${r.read} emails from the last 24 hours. Nothing new to confirm.`);
      await reload();
    } catch (e) { toast(message(e), true); }
    setBusy(false);
  };
  const dismiss = async (m: Row) => { try { await api(`/api/mails/${m.id}/dismiss`, "POST", {}); toast("Credit dismissed"); await reload(); } catch (e) { toast(message(e), true); } };
  return (
    <>
      <PageHead title="Bank alerts" sub={live?.mail || live?.devices.length ? <>{live.mail && <>Reading {live.mail.email}. <span className="num">{live.mail.screened}</span> subjects checked; only bank alerts are opened. </>}{live.devices.some((d) => d.status === "active") && <>Bank SMS arrive from {live.devices.filter((d) => d.status === "active").map((d) => d.label).join(", ")}.</>}</> : "Connect Gmail or pair a phone and your bank's credit alerts will show up here."}>
        {!live?.mail && <LinkButton href="/app/configuration">Connect Gmail</LinkButton>}
        {live?.mail && <Button variant="quiet" busy={busy} onClick={check}>{!busy && <MailSearch size={17} />}{busy ? "Reading Gmail" : "Check mail again"}</Button>}
      </PageHead>
      <div className="mb-4"><Segmented label="Filter" value={tab} onChange={setTab} options={TABS} /></div>
      {error && !data && <p className="card p-6 text-carnelian">{error}</p>}
      {!data && !error && <Skeleton className="h-64" />}
      {data?.rows.length === 0 && <div className="card"><Empty title={tab === "review" ? "Nothing to review" : "No alerts here"}>{tab === "review" ? "Credits that could not be tied to a payment will wait here for you." : undefined}</Empty></div>}
      <ul className="space-y-3">
        {data?.rows.map((m) => {
          const [label, cls, Icon] = OUT[m.outcome];
          const review = m.outcome === "unmatched" || m.outcome === "ambiguous";
          return (
            <li key={m.id} className="card p-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 basis-[320px]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${cls}`}><Icon size={13} />{label}</span>
                    <span className="text-[14px] text-ink-3">{m.reason}</span>
                  </div>
                  <p className="mt-2.5 break-words font-semibold">{m.subject}</p>
                  <p className="num break-all text-[13px] text-ink-3">{m.source === "lab" ? "Alert Lab" : m.source === "sms" ? `SMS · ${m.from_addr}` : m.from_addr} · {fmtTime(m.received_at)}</p>
                  {m.excerpt && <p className="mt-2.5 max-w-[80ch] break-words text-[14px] text-ink-2">{m.excerpt}</p>}
                  {(m.utr || m.payer_vpa) && <p className="mt-2 flex flex-wrap gap-x-5 text-[13px] text-ink-3">{m.utr && <span>UTR <span className="font-mono text-ink">{m.utr}</span></span>}{m.payer_vpa && <span>From <span className="text-ink">{m.payer_vpa}</span></span>}{m.payment_id && <span>Payment <span className="font-mono text-ink">{m.payment_id}</span></span>}</p>}
                </div>
                <div className="flex flex-col items-end gap-3 max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-between">
                  {m.amount != null && <p className="num text-[24px] font-semibold leading-none">{inr(m.amount)}</p>}
                  {review && <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => dismiss(m)}><Ban size={15} />Not a payment</Button><Button size="sm" onClick={() => setPick(m)}>Match</Button></div>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!pick} onClose={() => setPick(null)} title="Match this credit">{pick && <Match m={pick} done={(id) => { setPick(null); toast(`Matched to ${id}`); void reload(); }} />}</Dialog>
    </>
  );
}

function Match({ m, done }: { m: Row; done: (id: string) => void }) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const go = async (pid: string) => {
    setBusy(pid); setErr(null);
    try { await api(`/api/mails/${m.id}/link`, "POST", { paymentId: pid }); done(pid); } catch (e) { setErr(message(e)); setBusy(""); }
  };
  return (
    <div className="p-6">
      <p className="num text-ink-2"><b className="text-ink">{inr(m.amount ?? 0)}</b> received {fmtFull(m.received_at)}{m.payer_vpa && <> from {m.payer_vpa}</>}. The payment you pick will be marked paid. This cannot be undone.</p>
      {m.candidates.length > 0 ? (
        <ul className="mt-5 divide-y divide-line rounded-[10px] border border-line">
          {m.candidates.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0"><p className="truncate font-semibold">{p.customer_name || p.title}</p><p className="num text-[13px] text-ink-3"><span className="font-mono">{p.id}</span> · {fmtTime(p.created_at)}</p></div>
              <div className="flex items-center gap-2.5"><StatusPill status={p.status} /><Button size="sm" busy={busy === p.id} onClick={() => go(p.id)}>Match</Button></div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 rounded-[10px] bg-sunk px-4 py-3 text-[14px] text-ink-2">No open payment asked for exactly this amount.</p>}
      <form className="mt-5 flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); void go(id.trim().toUpperCase()); }}>
        <div className="flex-1"><Field label="Or enter a payment ID" error={err}>{(a) => <input {...a} className="field font-mono uppercase" maxLength={10} value={id} onChange={(e) => setId(e.target.value)} />}</Field></div>
        <Button type="submit" variant="quiet" disabled={id.trim().length !== 10} busy={!!busy && busy === id.trim().toUpperCase()} className={err ? "mb-[26px]" : ""}>Match</Button>
      </form>
    </div>
  );
}
