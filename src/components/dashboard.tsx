"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Hourglass, MailQuestion, Plus } from "lucide-react";
import type { Dashboard } from "@/lib/server/views";
import { inr } from "@/lib/money";
import { ago } from "@/lib/client";
import { BarList, HeatGrid, RevenueChart } from "./charts";
import { Guilloche } from "./brand";
import { useApi, useLive } from "./live";
import { PaymentDrawer } from "./payment-drawer";
import { Button, Empty, LinkButton, PageHead, Segmented, Skeleton, StatusPill } from "./ui";

const RANGES = [{ value: 1, label: "Today" }, { value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }];
const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const secs = (s: number | null) => (s === null ? "–" : s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (!before) return null;
  const d = (now - before) / before;
  const up = d >= 0;
  return (
    <span className={`num inline-flex items-center gap-1 text-[14px] font-semibold ${up ? "text-jade" : "text-carnelian"}`}>
      {up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{Math.abs(Math.round(d * 100))}%
      <span className="font-normal text-ink-3">vs {label}</span>
    </span>
  );
}

const Panel = ({ title, sub, children, action, className = "" }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) => (
  <section className={`card min-w-0 p-6 ${className}`}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><h2 className="font-display text-[19px] leading-tight">{title}</h2>{sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}</div>
      {action}
    </div>
    {children}
  </section>
);
const more = "inline-flex items-center gap-1 whitespace-nowrap text-[14px] font-semibold text-emerald hover:underline underline-offset-4";

export function DashboardView({ setup }: { setup: { upi: boolean; mail: boolean } }) {
  const [days, setDays] = useState(30);
  const { data: d, loading, error } = useApi<Dashboard>(`/api/dashboard?days=${days}`);
  const live = useLive();
  const [openId, setOpenId] = useState<string | null>(null);
  const mailOk = !!live?.mail || setup.mail || !!live?.devices.some((d) => d.status === "active");

  return (
    <>
      <PageHead title="Dashboard">
        <Segmented label="Date range" value={days} onChange={setDays} options={RANGES} />
        <LinkButton href="/app/create"><Plus size={17} />Create payment</LinkButton>
      </PageHead>

      {(!setup.upi || !mailOk) && <Setup upi={setup.upi} mail={mailOk} />}
      {error && !d && <div className="card p-6 text-carnelian">{error}</div>}
      {!d && !error && <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-[400px] lg:col-span-2" /><Skeleton className="h-[400px]" /></div>}

      {d && (
        <div className={`space-y-5 transition-opacity ${loading && d.days !== days ? "opacity-50" : ""}`}>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="card min-w-0 p-6 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
                <div>
                  <h2 className="text-ink-3">Collected {d.days === 1 ? "today" : `in the last ${d.days} days`}</h2>
                  <p className="num mt-1 text-[46px] font-semibold leading-none tracking-[-0.025em]">{inr(d.collected, { compact: d.collected >= 1e9 })}</p>
                  <p className="mt-3"><Delta now={d.collected} before={d.collectedBefore} label={d.days === 1 ? "yesterday" : `previous ${d.days} days`} /></p>
                </div>
                <dl className="flex gap-8 text-right max-sm:text-left">
                  <div><dt className="text-[13px] text-ink-3">Today</dt><dd className="num text-[19px] font-semibold">{inr(d.today)}</dd></div>
                  <div><dt className="text-[13px] text-ink-3">All time</dt><dd className="num text-[19px] font-semibold">{inr(d.lifetime, { compact: d.lifetime >= 1e9 })}</dd></div>
                </dl>
              </div>
              <div className="mt-6"><RevenueChart series={d.series} hourly={d.hourly} /></div>
            </section>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <section className="relative overflow-hidden rounded-[14px] bg-deep p-6 text-white">
                <Guilloche still className="pointer-events-none absolute -right-28 -top-28 h-[380px] w-[380px] text-brass-mid/40" />
                <div className="relative">
                  <h2 className="text-white/80">Gateway fees you kept</h2>
                  <p className="num mt-1 text-[38px] font-semibold leading-none tracking-[-0.02em] text-brass-lt">{inr(d.feesSaved)}</p>
                  <p className="mt-3 text-[14px] text-white/75">What a 2% gateway would have charged{d.days === 1 ? " today" : ` in ${d.days} days`}. <span className="num text-white">{inr(d.lifetimeSaved)}</span> all time.</p>
                </div>
              </section>
              <section className="card flex flex-col p-6">
                <div className="flex items-center gap-2 text-ink-3"><Hourglass size={16} className="text-amber" /><h2>Waiting for you</h2></div>
                {d.holdCount + d.strays.n === 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-ink-2"><Check size={17} className="text-jade" />Nothing needs review.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {d.holdCount > 0 && <li><Link href="/app/payments?status=on_hold" className="group flex items-center justify-between gap-3 py-3"><span><b className="num font-semibold">{d.holdCount}</b> on hold <span className="num text-ink-3">· {inr(d.holdAmount)}</span></span><ArrowRight size={17} className="text-ink-3 transition group-hover:translate-x-1" /></Link></li>}
                    {d.strays.n > 0 && <li><Link href="/app/mail" className="group flex items-center justify-between gap-3 py-3"><span className="flex items-center gap-2"><MailQuestion size={16} className="text-lapis" /><span><b className="num font-semibold">{d.strays.n}</b> unmatched credit{d.strays.n === 1 ? "" : "s"} <span className="num text-ink-3">· {inr(d.strays.a ?? 0)}</span></span></span><ArrowRight size={17} className="text-ink-3 transition group-hover:translate-x-1" /></Link></li>}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <dl className="card grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 xl:grid-cols-6">
            {[
              ["Payments received", String(d.paidCount), `of ${d.created} created`],
              ["Success rate", pct(d.successRate), d.successBefore === null ? "of finished payments" : `${pct(d.successBefore)} before`],
              ["Average payment", inr(d.average), d.requested ? `${inr(d.requested, { compact: true })} requested` : "no requests yet"],
              ["Confirmed by itself", pct(d.autoRate), "without your approval"],
              ["Time to confirm", secs(d.medianSeconds), "median"],
              ["Active links", String(d.links.a ?? 0), `${d.links.v ?? 0} views on ${d.links.n}`],
            ].map(([k, v, s]) => (
              <div key={k} className="bg-paper p-5">
                <dt className="text-[14px] text-ink-3">{k}</dt>
                <dd><span className="num mt-1 block text-[26px] font-semibold leading-tight tracking-[-0.01em]">{v}</span><span className="num text-[13px] text-ink-3">{s}</span></dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Where payments ended up" className="lg:col-span-1">
              <BarList empty="No payments in this period." rows={d.created ? d.status.filter((s) => s.count).map((s) => ({ key: s.key, label: <StatusPill status={s.key} />, value: s.count, display: String(s.count), note: inr(s.amount, { compact: true }), color: { paid: "#1b7a58", on_hold: "#b8780f", pending: "#2b509a", verifying: "#2b509a", declined: "#ab3423", expired: "#93a69b" }[s.key] })) : []} />
            </Panel>
            <Panel title="When customers pay"><HeatGrid heat={d.heat} /></Panel>
            <Panel title="How they paid">
              <BarList empty="No payments in this period." rows={d.bySource.map((r) => ({ key: r.label, label: r.label, value: r.amount, display: inr(r.amount, { compact: true }), note: `${r.count}` }))} />
              {d.byHandle.length > 0 && (
                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="mb-3 text-[14px] font-semibold">Customers' UPI handles</h3>
                  <ul className="flex flex-wrap gap-2">{d.byHandle.map((h) => <li key={h.label} className="rounded-full bg-sunk px-3 py-1 text-[14px]">{h.label} <b className="num">{h.count}</b></li>)}</ul>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Recent payments" className="lg:col-span-2" action={<Link href="/app/payments" className={more}>All payments<ArrowRight size={15} /></Link>}>
              {d.recent.length === 0 ? <Empty title="No payments yet" action={<LinkButton href="/app/create">Create your first payment</LinkButton>}>Share a link or show a QR code, and each payment will appear here as it happens.</Empty> : (
                <ul className="-mx-3 -mb-3">
                  {d.recent.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setOpenId(p.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-5 rounded-[10px] px-3 py-2.5 text-left hover:bg-sunk sm:grid-cols-[1fr_auto_110px]">
                        <span className="min-w-0"><span className="block truncate font-semibold">{p.payer_name || p.customer_name || p.title}</span><span className="num block truncate text-[13px] text-ink-3"><span className="font-mono">{p.id}</span> · {ago(p.created_at)}</span></span>
                        <span className="max-sm:hidden"><StatusPill status={p.status} /></span>
                        <span className="num text-right text-[16px] font-semibold">{inr(p.payable)}<span className="mt-1 block sm:hidden"><StatusPill status={p.status} /></span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Best links" action={<Link href="/app/links" className={more}>All links<ArrowRight size={15} /></Link>}>
              <BarList color="#b8934a" empty="Payments made through your links will rank here." rows={d.topLinks.map((r) => ({ key: r.label, label: r.label, value: r.amount, display: inr(r.amount, { compact: true }), note: `${r.count}` }))} />
            </Panel>
          </div>
        </div>
      )}
      <PaymentDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function Setup({ upi, mail }: { upi: boolean; mail: boolean }) {
  const steps = [
    { done: upi, title: "Add your UPI ID and bank", text: "Where customers' money goes." },
    { done: mail, title: "Connect Gmail or a phone", text: "How Mohur learns that money arrived." },
  ];
  return (
    <section className="mb-5 flex flex-wrap items-center gap-x-10 gap-y-5 rounded-[14px] border border-brass-mid/50 bg-brass-wash p-6">
      <h2 className="font-display text-[21px]">Finish setting up</h2>
      <ul className="flex flex-1 flex-wrap gap-x-10 gap-y-3">
        {steps.map((s) => (
          <li key={s.title} className="flex items-center gap-3">
            <span className={`grid h-7 w-7 place-items-center rounded-full ${s.done ? "bg-jade text-white" : "border-2 border-brass-mid"}`}>{s.done && <Check size={15} strokeWidth={3} />}</span>
            <span><b className="block font-semibold leading-tight">{s.title}</b><span className="text-[14px] text-ink-2">{s.text}</span></span>
          </li>
        ))}
      </ul>
      <LinkButton href="/app/configuration">Go to Configuration</LinkButton>
    </section>
  );
}
