"use client";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Link2, QrCode } from "lucide-react";
import type { CheckoutView } from "@/lib/server/views";
import { api } from "@/lib/client";
import { inr, parseRupees } from "@/lib/money";
import { qrPath } from "@/lib/qr";
import { Reeding } from "./brand";
import { useSubmit } from "./live";
import { useCheckout, useNow } from "./use-checkout";
import { DownloadQr, Qr } from "./qr";
import { Button, CopyButton, Empty, Field, LinkButton, PageHead, Segmented, StatusPill, Toggle } from "./ui";

export function CreateView({ type, ready, mail }: { type: "link" | "qr"; ready: boolean; mail: boolean }) {
  const [tab, setTab] = useState(type);
  if (!ready)
    return (
      <>
        <PageHead title="Create payment" />
        <div className="card"><Empty title="Add your UPI ID first" action={<LinkButton href="/app/configuration">Go to Configuration</LinkButton>}>Mohur needs to know where the money should go before it can draw a QR code.</Empty></div>
      </>
    );
  return (
    <>
      <PageHead title="Create payment" sub={tab === "link" ? "A page you can share anywhere. Each visitor gets a fresh QR code." : "One QR code for one payment, with its status live on this screen."}>
        <Segmented label="Type" value={tab} onChange={setTab} options={[{ value: "link", label: <span className="inline-flex items-center gap-2"><Link2 size={15} />Payment link</span> }, { value: "qr", label: <span className="inline-flex items-center gap-2"><QrCode size={15} />QR code</span> }]} />
      </PageHead>
      {!mail && <p className="mb-5 rounded-[10px] bg-amber-wash px-5 py-3 text-amber">Neither Gmail nor a phone is connected, so payments will not confirm themselves. You can still approve them by hand.</p>}
      {tab === "link" ? <LinkForm /> : <QrForm />}
    </>
  );
}

function AmountInput({ value, onChange, a, big }: { value: string; onChange: (v: string) => void; a: object; big?: boolean }) {
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 ${big ? "text-[26px]" : ""}`}>₹</span>
      <input {...a} className={`field num ${big ? "!pl-11 !text-[30px] font-semibold !py-3" : "!pl-9"}`} inputMode="decimal" autoComplete="off" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const EXPIRY = [[0, "Never"], [1, "In 1 hour"], [24, "In 1 day"], [168, "In 7 days"], [720, "In 30 days"]] as const;

function LinkForm() {
  const blank = { title: "", description: "", amount: "", minAmount: "", reusable: true, askName: true, askContact: false, redirectUrl: "", expiresInHours: 0 };
  const [f, set] = useState(blank);
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<{ url: string; title: string; amount: number | null } | null>(null);
  const { busy, errors, submit } = useSubmit();
  const paise = f.amount ? parseRupees(f.amount) : null;

  if (made) return <LinkMade {...made} again={() => { setMade(null); set(blank); setOpen(false); }} />;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <form
        noValidate className="card space-y-6 p-6 sm:p-8"
        onSubmit={(e) => { e.preventDefault(); void submit(async () => setMade(await api("/api/links", "POST", { ...f, openAmount: open }))); }}
      >
        <Field label="What is it for?" error={errors.title}>{(a) => <input {...a} className="field" maxLength={100} placeholder="Saturday pottery workshop" value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} />}</Field>
        <div className="space-y-4">
          {!open && <Field label="Amount" error={errors.amount}>{(a) => <AmountInput a={a} big value={f.amount} onChange={(amount) => set({ ...f, amount })} />}</Field>}
          {open && <Field label="Minimum amount" optional error={errors.minAmount}>{(a) => <AmountInput a={a} value={f.minAmount} onChange={(minAmount) => set({ ...f, minAmount })} />}</Field>}
          <Toggle label="Let the customer enter the amount" checked={open} onChange={setOpen} />
        </div>
        <Field label="Description" optional error={errors.description}>{(a) => <textarea {...a} className="field min-h-[92px]" maxLength={500} value={f.description} onChange={(e) => set({ ...f, description: e.target.value })} />}</Field>
        <div className="space-y-4 border-t border-line pt-6">
          <Toggle label="Ask for the customer's name" checked={f.askName} onChange={(askName) => set({ ...f, askName })} />
          <Toggle label="Ask for a phone number or email" checked={f.askContact} onChange={(askContact) => set({ ...f, askContact })} />
          <Toggle label="Accept many payments" hint="Turn off to close the link after the first successful payment." checked={f.reusable} onChange={(reusable) => set({ ...f, reusable })} />
        </div>
        <div className="grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
          <Field label="Expires">{(a) => <select {...a} className="field" value={f.expiresInHours} onChange={(e) => set({ ...f, expiresInHours: Number(e.target.value) })}>{EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>
          <Field label="Send customer to, after paying" optional error={errors.redirectUrl}>{(a) => <input {...a} className="field" type="url" placeholder="https://" value={f.redirectUrl} onChange={(e) => set({ ...f, redirectUrl: e.target.value })} />}</Field>
        </div>
        {errors.form && <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-carnelian">{errors.form}</p>}
        <Button type="submit" size="lg" busy={busy} className="w-full sm:w-auto">Create link</Button>
      </form>
      <aside aria-label="Preview" className="sticky top-8 overflow-hidden rounded-[14px] bg-deep p-8 text-white max-lg:hidden">
        <p className="text-[14px] text-white/70">What customers will see</p>
        <p className="mt-6 break-words font-display text-[26px] leading-tight">{f.title || "Your title"}</p>
        {f.description && <p className="mt-2 whitespace-pre-line break-words text-white/75">{f.description}</p>}
        <p className="num mt-8 text-[44px] font-semibold leading-none tracking-[-0.02em] text-brass-lt">{open ? "Any amount" : paise ? inr(paise) : "₹0"}</p>
        <div className="shine mt-8 rounded-[9px] py-3.5 text-center font-semibold text-deep">Pay with UPI</div>
      </aside>
    </div>
  );
}

function LinkMade({ url, title, amount, again }: { url: string; title: string; amount: number | null; again: () => void }) {
  const q = qrPath(url);
  const text = `${title}${amount ? ` (${inr(amount)})` : ""}: ${url}`;
  return (
    <div className="card rise grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[auto_1fr]">
      <div className="mx-auto rounded-[14px] border border-line bg-white p-3"><Qr {...q} px={236} /></div>
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 font-semibold text-jade"><Check size={18} />Link is live</p>
        <h2 className="mt-1 break-words font-display text-[28px] leading-tight">{title}</h2>
        <p className="num text-[19px] text-ink-2">{amount ? inr(amount) : "Customer enters the amount"}</p>
        <div className="mt-5 flex items-center justify-between gap-2 rounded-[10px] bg-sunk px-4 py-2.5"><span className="truncate font-mono text-[14px]">{url}</span><CopyButton text={url} className="hover:!bg-line" /></div>
        <p className="mt-2 text-[13px] text-ink-3">This QR opens the payment page. The UPI QR is made fresh for each customer, so every payment can be told apart.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton target="_blank" rel="noreferrer" href={url}><ExternalLink size={16} />Open page</LinkButton>
          <LinkButton variant="quiet" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>Share on WhatsApp</LinkButton>
          <DownloadQr {...q} name={`mohur-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} caption={[title, amount ? inr(amount) : "Scan to pay"]} />
          <Button variant="ghost" onClick={again}>Create another</Button>
        </div>
      </div>
    </div>
  );
}

function QrForm() {
  const [f, set] = useState({ amount: "", title: "", customer: "" });
  const [made, setMade] = useState<CheckoutView | null>(null);
  const { busy, errors, submit } = useSubmit();
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
      <form noValidate className="card space-y-5 p-6 sm:p-8" onSubmit={(e) => { e.preventDefault(); void submit(async () => setMade(await api<CheckoutView>("/api/payments", "POST", f))); }}>
        <Field label="Amount" error={errors.amount}>{(a) => <AmountInput a={a} big value={f.amount} onChange={(amount) => set({ ...f, amount })} />}</Field>
        <Field label="What is it for?" optional error={errors.title}>{(a) => <input {...a} className="field" maxLength={100} value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} />}</Field>
        <Field label="Customer name" optional error={errors.customer}>{(a) => <input {...a} className="field" maxLength={80} value={f.customer} onChange={(e) => set({ ...f, customer: e.target.value })} />}</Field>
        {errors.form && <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-carnelian">{errors.form}</p>}
        <Button type="submit" size="lg" busy={busy} className="w-full">{made ? "Show a new QR code" : "Show QR code"}</Button>
      </form>
      <div className="card grid min-h-[520px] place-items-center p-6">
        {made ? <LiveQr key={made.id} initial={made} /> : <Empty title="Your QR code will appear here">Show it to the customer. The moment the bank alert lands, this screen says paid.</Empty>}
      </div>
    </div>
  );
}

function LiveQr({ initial }: { initial: CheckoutView }) {
  const { v, act, busy } = useCheckout(initial);
  const now = useNow(v);
  const [q, setQ] = useState(initial.upi);
  useEffect(() => { if (v.upi) setQ(v.upi); }, [v.upi]);
  const lit = v.status === "verifying" && v.verifyUntil ? Math.ceil(((v.verifyUntil - now) / (v.verifySeconds * 1000)) * 60) : v.status === "pending" ? Math.ceil(((v.qrUntil - now) / Math.max(1, v.qrUntil - v.createdAt)) * 60) : v.status === "paid" ? 60 : 0;
  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="relative grid aspect-square w-full max-w-[360px] place-items-center">
        <Reeding lit={lit} tone={v.status === "verifying" ? "#b8934a" : "#1b7a58"} />
        {v.status === "paid" ? (
          <div className="strike shine grid h-[62%] w-[62%] place-items-center rounded-full text-deep"><Check size={92} strokeWidth={1.6} /></div>
        ) : q && (v.status === "pending" || v.status === "verifying") ? <Qr {...q.qr} className="w-[62%]" /> : <p className="max-w-[22ch] text-ink-3">{v.status === "on_hold" ? "Still listening. If the bank alert arrives late, this will turn to paid." : "This QR code is closed."}</p>}
      </div>
      <p className="num mt-4 text-[38px] font-semibold leading-none tracking-[-0.02em]">{inr(v.payable)}</p>
      {v.payable !== v.amount && <p className="num mt-2 text-[14px] text-ink-3">{inr(v.amount)} plus {v.payable - v.amount} paise, so this payment can be told apart</p>}
      <div className="mt-4 flex items-center gap-3" aria-live="polite"><StatusPill status={v.status} /><span className="font-mono">{v.id}</span><CopyButton text={v.id} /></div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {v.status === "pending" && <Button busy={busy} onClick={() => act("claim")}>Customer has paid</Button>}
        {q && v.status === "pending" && <DownloadQr {...q.qr} name={`mohur-${v.id}`} caption={[inr(v.payable), v.business]} />}
        {v.status === "on_hold" && <LinkButton variant="quiet" href={`/app/check?id=${v.id}`}>Review payment</LinkButton>}
      </div>
    </div>
  );
}
