"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CircleCheck, CircleX, FlaskConical, Landmark, Palette, Mail, ShieldCheck, SlidersHorizontal, Smartphone, TriangleAlert, User } from "lucide-react";
import type { SettingsView } from "@/lib/server/views";
import { BANKS, bankByIfsc } from "@/lib/banks";
import { api, ago, fmtDay, message } from "@/lib/client";
import { inr } from "@/lib/money";
import { useLive, useSubmit, type MailInfo } from "./live";
import { PhonePanel } from "./phone-panel";
import { UpiAccounts } from "./upi-accounts";
import { BrandForm } from "./brand-form";
import { Button, Dialog, Field, LinkButton, PageHead, Segmented, Toggle, useToast } from "./ui";

const TABS = [
  { id: "bank", label: "UPI accounts", Icon: Landmark },
  { id: "gmail", label: "Gmail", Icon: Mail },
  { id: "phone", label: "Phone (SMS)", Icon: Smartphone },
  { id: "rules", label: "Payment rules", Icon: SlidersHorizontal },
  { id: "brand", label: "Checkout look", Icon: Palette },
  { id: "lab", label: "Alert Lab", Icon: FlaskConical },
  { id: "account", label: "Account", Icon: User },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function Configuration({ settings, me, google, simulator, welcome, error, connected }: { welcome: boolean; error: string | null; connected: boolean; settings: SettingsView; me: { name: string; business: string; email: string }; google: boolean; simulator: boolean }) {
  const [tab, setTab] = useState<Tab>(error || connected ? "gmail" : "bank");
  const [s, setS] = useState(settings);
  const codes = [...new Set(s.accounts.map((a) => a.bank_code))];
  return (
    <>
      <PageHead title="Configuration" sub={welcome ? `Welcome, ${me.name.split(" ")[0]}. Add your bank and UPI details, then connect Gmail, and you can start collecting.` : undefined} />
      <div className="grid items-start gap-6 lg:grid-cols-[210px_1fr]">
        <div role="tablist" aria-label="Configuration" className="flex gap-1 overflow-x-auto lg:sticky lg:top-8 lg:flex-col">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="panel" onClick={() => setTab(t.id)} className={`flex h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-[9px] px-3.5 text-left transition ${tab === t.id ? "bg-emerald font-semibold text-white" : "text-ink-2 hover:bg-sunk"}`}><t.Icon size={17} />{t.label}</button>
          ))}
        </div>
        <div role="tabpanel" id="panel" aria-labelledby={`tab-${tab}`} className="min-w-0 max-w-[780px] space-y-5">
          {tab === "bank" && <UpiAccounts s={s} saved={(r) => setS({ ...s, accounts: r.rows, mismatch: r.mismatch })} next={() => setTab("gmail")} />}
          {tab === "gmail" && <Gmail google={google} note={error} banks={codes} />}
          {tab === "phone" && <PhonePanel banks={codes} />}
          {tab === "rules" && <Rules s={s} saved={setS} />}
          {tab === "brand" && <BrandForm s={s} saved={setS} business={me.business} />}
          {tab === "lab" && <Lab simulator={simulator} bank={codes[0] ?? "any"} />}
          {tab === "account" && <Account me={me} />}
        </div>
      </div>
    </>
  );
}

const Box = ({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) => <section className="card p-6 sm:p-8"><h2 className="font-display text-[22px] leading-tight">{title}</h2>{sub && <p className="mt-1 max-w-[64ch] text-ink-3">{sub}</p>}<div className="mt-6">{children}</div></section>;
const FormError = ({ e }: { e?: string }) => (e ? <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-carnelian">{e}</p> : null);

const STATE: Record<MailInfo["status"], [string, string]> = { live: ["Listening", "bg-jade"], connecting: ["Connecting", "bg-[#b8780f] breathe"], retrying: ["Reconnecting", "bg-[#b8780f] breathe"], error: ["Needs attention", "bg-carnelian"] };

function Gmail({ google, note, banks }: { google: boolean; note: string | null; banks: string[] }) {
  const mail = useLive()?.mail ?? null;
  const [f, set] = useState({ email: "", password: "" });
  const [off, setOff] = useState(false);
  const { busy, errors, submit } = useSubmit();
  const toast = useToast();
  const names = !banks.length || banks.includes("any") ? "any supported bank" : banks.map((c) => BANKS.find((b) => b.code === c)?.name ?? c).join(", ");
  return (
    <>
      {note && <FormError e={note} />}
      {mail && (
        <Box title="Connected mailbox">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="break-all text-[19px] font-semibold">{mail.email}</p>
              <p className="mt-1 flex items-center gap-2 text-ink-2"><i className={`h-2 w-2 rounded-full ${STATE[mail.status][1]}`} />{STATE[mail.status][0]}{mail.last_checked_at && <span className="text-ink-3">· checked {ago(mail.last_checked_at)}</span>}</p>
              {mail.last_error && mail.status !== "live" && <p className="mt-2 max-w-[56ch] text-carnelian">{mail.last_error}</p>}
            </div>
            <Button variant="danger" onClick={() => setOff(true)}>Disconnect</Button>
          </div>
          <dl className="num mt-6 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-3">
            <div><dt className="text-[13px] text-ink-3">Subjects checked</dt><dd className="text-[19px] font-semibold">{mail.screened}</dd></div>
            <div><dt className="text-[13px] text-ink-3">Connected</dt><dd className="text-[19px] font-semibold">{fmtDay(mail.connected_at)}</dd></div>
            <div><dt className="text-[13px] text-ink-3">Trusted senders</dt><dd className="text-[19px] font-semibold capitalize">{names}</dd></div>
          </dl>
        </Box>
      )}
      <Box title={mail ? "Connect a different mailbox" : "Connect Gmail"} sub="Use the Gmail address your bank sends transaction alerts to. Access is read-only: Mohur never sends, deletes or marks mail.">
        {google && <><LinkButton href="/api/mail/google/start" size="lg" variant="quiet" className="w-full">Continue with Google</LinkButton><p className="my-5 text-center text-[14px] text-ink-3">or use an app password</p></>}
        <div className="grid gap-8 md:grid-cols-[1fr_1.05fr]">
          <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(async () => { await api("/api/mail", "POST", f); set({ email: "", password: "" }); toast("Gmail connected. Listening for bank mail."); }); }}>
            <Field label="Gmail address" error={errors.email}>{(a) => <input {...a} className="field" type="email" autoComplete="off" value={f.email} onChange={(e) => set({ ...f, email: e.target.value })} />}</Field>
            <Field label="App password" error={errors.password} hint="16 letters from Google. Not your normal password.">{(a) => <input {...a} className="field font-mono" type="password" autoComplete="off" value={f.password} onChange={(e) => set({ ...f, password: e.target.value })} />}</Field>
            <FormError e={errors.form} />
            <Button type="submit" size="lg" busy={busy} className="w-full">{busy ? "Signing in to Gmail" : "Connect Gmail"}</Button>
          </form>
          <div className="rounded-[12px] bg-sunk p-5 text-[14px]">
            <h3 className="font-semibold">Get an app password</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-2 marker:text-ink-3">
              <li>Turn on 2-Step Verification for your Google account.</li>
              <li>Open <a className="font-semibold text-emerald underline underline-offset-4" target="_blank" rel="noreferrer" href="https://myaccount.google.com/apppasswords">Google app passwords</a>.</li>
              <li>Name it Mohur and create it.</li>
              <li>Paste the 16 letters here.</li>
            </ol>
            <p className="mt-4 flex gap-2 border-t border-line-strong pt-4 text-ink-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-jade" />Stored encrypted. You can revoke it from Google at any time.</p>
          </div>
        </div>
      </Box>
      <Box title="How a bank mail is checked">
        <ol className="space-y-4">
          {[["Subject", "Only the sender and subject are read first. Anything that does not look like a credit alert stops here, unopened and unstored."], ["Sender", "The address must belong to your bank, and Gmail must confirm it by DKIM or DMARC. A forged bank mail is kept aside as suspicious."], ["Body", "Amount, UTR, payer and account are read. Debits, refunds, offers and failed transfers never count."], ["Match", "The credit must equal the exact amount of one open payment, and arrive after it was created."]].map(([t, d], i) => (
            <li key={t} className="flex gap-4"><span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brass-mid text-[14px] font-semibold text-brass">{i + 1}</span><p className="text-ink-2"><b className="text-ink">{t}.</b> {d}</p></li>
          ))}
        </ol>
      </Box>
      <Dialog open={off} onClose={() => setOff(false)} title="Disconnect Gmail">
        <div className="p-6"><p>Mohur will delete the saved access and stop confirming payments by itself. You can still approve them by hand.</p><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setOff(false)}>Cancel</Button><Button variant="danger" onClick={async () => { setOff(false); try { await api("/api/mail", "DELETE"); toast("Gmail disconnected"); } catch (e) { toast(message(e), true); } }}>Disconnect</Button></div></div>
      </Dialog>
    </>
  );
}

function Choice<T extends string>({ name, value, onChange, options }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; title: string; text: string }[] }) {
  return (
    <div className="space-y-2.5">
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer gap-3.5 rounded-[11px] border p-4 transition ${value === o.value ? "border-emerald bg-jade-wash/50" : "border-line-strong hover:border-ink-3"}`}>
          <input type="radio" name={name} className="mt-1 accent-emerald" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span><b className="block font-semibold">{o.title}</b><span className="text-[14px] text-ink-2">{o.text}</span></span>
        </label>
      ))}
    </div>
  );
}

function Rules({ s, saved }: { s: SettingsView; saved: (s: SettingsView) => void }) {
  const [f, set] = useState({ rotation: s.rotation, verify_seconds: String(s.verify_seconds), qr_minutes: String(s.qr_minutes), hold_minutes: String(s.hold_minutes), timer_start: s.timer_start, amount_mode: s.amount_mode, show_bank: !!s.show_bank, support_contact: s.support_contact, extra_domains: s.extra_domains, extra_headers: s.extra_headers });
  const { busy, errors, submit } = useSubmit();
  const toast = useToast();
  const num = (k: "verify_seconds" | "qr_minutes" | "hold_minutes", label: string, unit: string, hint: string) => (
    <Field label={label} hint={hint} error={errors[k]}>{(a) => <div className="relative"><input {...a} className="field num !pr-20" inputMode="numeric" value={f[k]} onChange={(e) => set({ ...f, [k]: e.target.value.replace(/\D/g, "") })} /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-3">{unit}</span></div>}</Field>
  );
  return (
    <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => { saved(await api<SettingsView>("/api/settings/rules", "PUT", { ...f, verify_seconds: Number(f.verify_seconds), qr_minutes: Number(f.qr_minutes), hold_minutes: Number(f.hold_minutes) })); toast("Payment rules saved"); }); }}>
      <Box title="Timing">
        <Choice name="timer" value={f.timer_start} onChange={(timer_start) => set({ ...f, timer_start })} options={[
          { value: "claim", title: "Start the clock when the customer taps I have paid", text: "They get time to scan and enter their PIN, then the verification countdown runs." },
          { value: "qr", title: "Start the clock when the QR code appears", text: "Stricter. Most customers will still be entering their PIN when it runs out, so expect more holds." },
        ]} />
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {num("verify_seconds", "Verification", "seconds", "No mail in this time puts the payment on hold.")}
          {num("qr_minutes", "QR code open for", "minutes", "Then it goes on hold too.")}
          {num("hold_minutes", "Keep matching for", "minutes", "A late mail in this time still settles it.")}
        </div>
      </Box>
      {s.accounts.length > 1 && (
        <Box title="Several UPI accounts" sub="Which account a new payment goes to. Accounts that would pass their daily or monthly limit are skipped.">
          <Choice name="rotation" value={f.rotation} onChange={(rotation) => set({ ...f, rotation })} options={[
            { value: "default", title: "Default account first", text: "Use the default until it reaches a limit, then the next account." },
            { value: "random", title: "Spread across accounts", text: "Pick at random among accounts with room left." },
          ]} />
        </Box>
      )}
      <Box title="Telling payments apart" sub="Bank mails rarely say who a payment was for, so Mohur identifies each one by its exact amount.">
        <Choice name="mode" value={f.amount_mode} onChange={(amount_mode) => set({ ...f, amount_mode })} options={[
          { value: "smart", title: "Add paise only when needed", text: "The first customer pays ₹500. If someone else is paying ₹500 at the same time, they are asked for ₹500.01." },
          { value: "strict", title: "Always add 1 to 99 paise", text: "Safest. An unrelated ₹500 sent to your account can never be mistaken for an order." },
          { value: "off", title: "Never change the amount", text: "Two people paying the same amount at once will need their UTR or your approval." },
        ]} />
      </Box>
      <Box title="Checkout">
        <div className="space-y-6">
          <Field label="Support contact" optional hint="Shown to customers whose payment is on hold." error={errors.support_contact}>{(a) => <input {...a} className="field" placeholder="Phone, WhatsApp or email" value={f.support_contact} onChange={(e) => set({ ...f, support_contact: e.target.value })} />}</Field>
          <Toggle label="Offer bank transfer" hint={s.accounts.some((a) => a.has_account) ? "Shows the full account number and IFSC of the account a payment goes to." : "Add an account number first."} checked={f.show_bank} onChange={(show_bank) => set({ ...f, show_bank: show_bank && s.accounts.some((a) => a.has_account) })} />
        </div>
      </Box>
      <Box title="Extra bank domains" sub="Only needed if your bank writes from a domain Mohur does not know. Each one is still checked by DKIM or DMARC.">
        <Field label="Domains" optional error={errors.extra_domains} hint="Separate with commas. Anyone who can send from these can confirm payments, so add your bank's domain only.">{(a) => <input {...a} className="field font-mono" placeholder="alerts.mybank.in" value={f.extra_domains} onChange={(e) => set({ ...f, extra_domains: e.target.value })} />}</Field>
      </Box>
      <Box title="Extra SMS senders" sub="Only needed if your bank texts from a sender Mohur does not know. For a text from VM-HDFCBK-S, the sender is HDFCBK.">
        <Field label="Senders" optional error={errors.extra_headers} hint="Separate with commas. Add your bank's own sender only.">{(a) => <input {...a} className="field font-mono uppercase" placeholder="MYBANK" value={f.extra_headers} onChange={(e) => set({ ...f, extra_headers: e.target.value })} />}</Field>
      </Box>
      <FormError e={errors.form} />
      <Button type="submit" size="lg" busy={busy}>Save rules</Button>
    </form>
  );
}

type LabOut = { subjectOk: boolean; screened: { verdict: string; reason?: string; bank?: string }; parsed: { ok: true; credit: { amount: number; utr: string | null; payerVpa: string | null; payerName: string | null; accountTail: string | null } } | { ok: false; reason: string } };

function Lab({ simulator, bank }: { simulator: boolean; bank: string }) {
  const domain = (BANKS.find((b) => b.code === bank) ?? BANKS[0]).domains[0];
  const [f, set] = useState({ from: `alerts@${domain}`, subject: "View: Account update for your bank A/c", body: "Dear Customer, Rs.500.00 is successfully credited to your account by VPA customer@okaxis RAVI KUMAR on 25-11-26. Your UPI transaction reference number is 633012345678.", authenticated: true });
  const [kind, setKind] = useState<"email" | "sms">("email");
  const bankSms = (BANKS.find((b) => b.code === bank) ?? BANKS[0]).sms[0];
  const [t, setT] = useState({ sender: `VM-${bankSms}-S`, body: `Credit Alert! Rs.500.00 credited to your A/c from VPA customer@okaxis (UPI 633012345678)` });
  const payload = (extra: object = {}) => (kind === "sms" ? { channel: "sms", from: t.sender, subject: "", body: t.body, ...extra } : { ...f, ...extra });
  const [out, setOut] = useState<LabOut | null>(null);
  const { busy, errors, submit } = useSubmit();
  const toast = useToast();
  const Row = ({ ok, warn, title, text }: { ok: boolean; warn?: boolean; title: string; text: string }) => <li className="flex gap-3">{ok ? <CircleCheck size={20} className="mt-0.5 shrink-0 text-jade" /> : warn ? <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber" /> : <CircleX size={20} className="mt-0.5 shrink-0 text-carnelian" />}<span><b className="font-semibold">{title}</b><span className="block text-ink-2">{text}</span></span></li>;
  return (
    <Box title="Alert Lab" sub="Paste one of your bank's real alerts to see exactly how Mohur would read it.">
      <div className="mb-6"><Segmented label="Kind of alert" value={kind} onChange={(k) => { setKind(k); setOut(null); }} options={[{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }]} /></div>
      <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => setOut(await api<LabOut>("/api/lab", "POST", payload()))); }}>
        {kind === "sms" ? (<>
          <Field label="Sender">{(a) => <input {...a} className="field font-mono" value={t.sender} onChange={(e) => setT({ ...t, sender: e.target.value })} />}</Field>
          <Field label="Message">{(a) => <textarea {...a} className="field min-h-[120px]" value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />}</Field>
        </>) : (<>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="From">{(a) => <input {...a} className="field" value={f.from} onChange={(e) => set({ ...f, from: e.target.value })} />}</Field>
          <Field label="Subject">{(a) => <input {...a} className="field" value={f.subject} onChange={(e) => set({ ...f, subject: e.target.value })} />}</Field>
        </div>
        <Field label="Body">{(a) => <textarea {...a} className="field min-h-[150px]" value={f.body} onChange={(e) => set({ ...f, body: e.target.value })} />}</Field>
        <Toggle label="Gmail confirmed the sender" hint="Turn off to see how a forged mail is treated." checked={f.authenticated} onChange={(authenticated) => set({ ...f, authenticated })} />
        </>)}
        <FormError e={errors.form} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" busy={busy}>Read this {kind === "sms" ? "SMS" : "mail"}</Button>
          {simulator && <Button variant="quiet" disabled={busy} onClick={() => submit(async () => { const r = await api<{ outcome: string }>("/api/lab", "POST", payload({ inject: true })); toast(`Received as bank alert: ${r.outcome}`, r.outcome === "suspicious" || r.outcome === "skipped"); })}>Send as if received</Button>}
        </div>
        {simulator && <p className="text-[13px] text-ink-3">Send as if received settles real records. It is for testing, and is off in production.</p>}
      </form>
      {out && (
        <ol className="rise mt-7 space-y-4 border-t border-line pt-6">
          <Row ok={out.subjectOk} title={kind === "sms" ? (out.subjectOk ? "Text looks like a credit alert" : "Text rejected") : out.subjectOk ? "Subject looks like a credit alert" : "Subject rejected"} text={kind === "sms" ? (out.subjectOk ? "It would be sent from your phone to Mohur." : "It would never leave your phone.") : out.subjectOk ? "The mail moves on to sender checks." : "The mail would never be opened."} />
          <Row ok={out.screened.verdict === "read"} warn={out.screened.verdict === "suspicious"} title={out.screened.verdict === "read" ? `Sender is ${out.screened.bank}` : "Sender not trusted"} text={out.screened.reason ?? (kind === "sms" ? "The sender is registered to your bank." : "Address and authentication both check out.")} />
          <Row ok={out.parsed.ok} title={out.parsed.ok ? `${inr(out.parsed.credit.amount)} credited` : "No payment found in the body"} text={out.parsed.ok ? [out.parsed.credit.utr && `UTR ${out.parsed.credit.utr}`, out.parsed.credit.payerName, out.parsed.credit.payerVpa, out.parsed.credit.accountTail && `account ending ${out.parsed.credit.accountTail}`].filter(Boolean).join(" · ") || "Only the amount was found" : out.parsed.reason} />
        </ol>
      )}
    </Box>
  );
}

function Account({ me }: { me: { name: string; business: string; email: string } }) {
  const router = useRouter();
  const [p, setP] = useState({ name: me.name, business: me.business });
  const [w, setW] = useState({ current: "", next: "" });
  const a1 = useSubmit();
  const a2 = useSubmit();
  const toast = useToast();
  return (
    <>
      <Box title="Profile" sub={me.email}>
        <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); void a1.submit(async () => { await api("/api/settings/profile", "PUT", p); toast("Profile saved"); router.refresh(); }); }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" error={a1.errors.name}>{(a) => <input {...a} className="field" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />}</Field>
            <Field label="Business name" error={a1.errors.business} hint="Shown on every checkout page.">{(a) => <input {...a} className="field" value={p.business} onChange={(e) => setP({ ...p, business: e.target.value })} />}</Field>
          </div>
          <FormError e={a1.errors.form} />
          <Button type="submit" busy={a1.busy}>Save profile</Button>
        </form>
      </Box>
      <Box title="Password" sub="Changing it signs you out everywhere else.">
        <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); void a2.submit(async () => { await api("/api/settings/password", "PUT", w); setW({ current: "", next: "" }); toast("Password changed"); }); }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Current password" error={a2.errors.current}>{(a) => <input {...a} className="field" type="password" autoComplete="current-password" value={w.current} onChange={(e) => setW({ ...w, current: e.target.value })} />}</Field>
            <Field label="New password" error={a2.errors.next} hint="At least 10 characters">{(a) => <input {...a} className="field" type="password" autoComplete="new-password" value={w.next} onChange={(e) => setW({ ...w, next: e.target.value })} />}</Field>
          </div>
          <FormError e={a2.errors.form} />
          <Button type="submit" busy={a2.busy}>Change password</Button>
        </form>
      </Box>
      <DeleteAccount />
    </>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [f, set] = useState({ password: "", confirm: "" });
  const { busy, errors, submit } = useSubmit();
  return (
    <section className="rounded-[14px] border border-carnelian/35 bg-paper p-6 sm:p-8">
      <h2 className="font-display text-[22px] leading-tight">Delete account</h2>
      <p className="mt-1 max-w-[64ch] text-ink-2">Permanently deletes this account and everything in it: payments, links, bank details, Gmail access, paired phones, API keys and webhooks. Open payment links stop working. This cannot be undone.</p>
      <p className="mt-2 max-w-[64ch] text-[14px] text-ink-3">Money already paid stays in your bank account; Mohur never holds it. Export your payments first if you want a record. A copy may remain in the server&apos;s nightly backups for up to 14 days.</p>
      {!open ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <LinkButton variant="quiet" href="/api/payments/export" download>Export payments (CSV)</LinkButton>
          <Button variant="danger" onClick={() => setOpen(true)}>Delete my account</Button>
        </div>
      ) : (
        <form noValidate className="mt-6 space-y-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => { await api("/api/account/delete", "POST", f); location.href = "/login?deleted=1"; }); }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your password" error={errors.password}>{(a) => <input {...a} className="field" type="password" autoComplete="current-password" value={f.password} onChange={(e) => set({ ...f, password: e.target.value })} />}</Field>
            <Field label="Type DELETE to confirm" error={errors.confirm}>{(a) => <input {...a} className="field font-mono" autoComplete="off" spellCheck={false} value={f.confirm} onChange={(e) => set({ ...f, confirm: e.target.value })} />}</Field>
          </div>
          <FormError e={errors.form} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" busy={busy} disabled={f.confirm !== "DELETE" || !f.password}>Delete account permanently</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); set({ password: "", confirm: "" }); }}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  );
}
