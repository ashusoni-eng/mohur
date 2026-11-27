"use client";
import { useState } from "react";
import { Plus, Star, TriangleAlert } from "lucide-react";
import type { SettingsView } from "@/lib/server/views";
import type { AccountView } from "@/lib/server/accounts";
import { BANKS, bankByIfsc } from "@/lib/banks";
import { api, message } from "@/lib/client";
import { inr } from "@/lib/money";
import { useLive, useSubmit } from "./live";
import { Button, Dialog, Field, Toggle, useToast } from "./ui";

const blank = { label: "", upi_id: "", payee_name: "", account_holder: "", account_number: "", ifsc: "", bank_name: "", branch_name: "", bank_code: "any", daily_limit: "", monthly_limit: "", active: true, is_default: false };
type Form = typeof blank;
const rupees = (p: number | null) => (p === null ? "" : String(p / 100));

function Meter({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  if (limit === null) return <p className="num text-[13px] text-ink-3">{label}: {inr(used)} · no limit</p>;
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <p className="num flex justify-between text-[13px] text-ink-3"><span>{label}</span><span>{inr(used)} of {inr(limit)}</span></p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "#ab3423" : pct >= 70 ? "#b8780f" : "#1b7a58" }} /></div>
    </div>
  );
}

type Saved = { rows: AccountView[]; mismatch: SettingsView["mismatch"] };
export function UpiAccounts({ s, saved, next }: { s: SettingsView; saved: (r: Saved) => void; next: () => void }) {
  const [edit, setEdit] = useState<{ id?: number; f: Form } | null>(null);
  const toast = useToast();
  const live = useLive();
  const rows = s.accounts;
  return (
    <>
      {s.mismatch && (
        <div role="alert" className="flex gap-3.5 rounded-[14px] bg-amber-wash p-5 text-amber">
          <TriangleAlert size={20} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Money is arriving in an account Mohur doesn&apos;t know</p><p className="mt-1 text-ink-2">Your bank says it credited the account ending <b className="num">{s.mismatch.tail}</b>, but your saved accounts end <b className="num">{s.mismatch.saved}</b>. If that account is yours, add it (or fix its account number) and waiting payments are checked again.</p></div>
        </div>
      )}
      <section className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[22px] leading-tight">UPI accounts</h2>
            <p className="mt-1 max-w-[62ch] text-ink-3">Every QR pays one of these directly; Mohur never holds your money. Add more than one to spread payments across banks or stay under a daily or monthly limit.</p>
          </div>
          <Button onClick={() => setEdit({ f: { ...blank, label: rows.length ? `Account ${rows.length + 1}` : "Main account", is_default: !rows.length } })}><Plus size={17} />Add UPI account</Button>
        </div>
        {rows.length === 0 && <p className="mt-6 rounded-[12px] bg-sunk p-5 text-ink-2">No UPI account yet. Add the UPI ID your customers should pay.</p>}
        <ul className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rows.map((a) => (
            <li key={a.id} className={`rounded-[14px] border p-5 ${a.active ? "border-line bg-white" : "border-dashed border-line-strong bg-sunk/60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">{a.label}{a.is_default ? <span className="inline-flex items-center gap-1 rounded-full bg-brass-wash px-2 py-0.5 text-[12px] font-semibold text-brass"><Star size={11} />Default</span> : null}{!a.active && <span className="rounded-full bg-line px-2 py-0.5 text-[12px] text-ink-3">Paused</span>}</p>
                  <p className="truncate font-mono text-[14px] text-ink-2">{a.upi_id}</p>
                  <p className="text-[13px] text-ink-3">{BANKS.find((b) => b.code === a.bank_code)?.name ?? "Any bank"}{a.account_tail ? ` · account ending ${a.account_tail}` : " · add the account number to check alerts"}</p>
                </div>
                <Button size="sm" variant="quiet" onClick={() => setEdit({ id: a.id, f: { ...blank, label: a.label, upi_id: a.upi_id, payee_name: a.payee_name, account_holder: a.account_holder, ifsc: a.ifsc, bank_name: a.bank_name, branch_name: a.branch_name, bank_code: a.bank_code, daily_limit: rupees(a.daily_limit), monthly_limit: rupees(a.monthly_limit), active: !!a.active, is_default: !!a.is_default } })}>Edit</Button>
              </div>
              <div className="mt-4 space-y-2.5">
                <Meter label="Today" used={a.used_today} limit={a.daily_limit} />
                <Meter label="This month" used={a.used_month} limit={a.monthly_limit} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit UPI account" : "Add UPI account"} side>
        {edit && <Editor key={edit.id ?? "new"} id={edit.id} initial={edit.f} has={rows.find((r) => r.id === edit.id)} only={rows.length <= 1 && !!edit.id}
          done={(r, msg) => { saved(r); setEdit(null); toast(msg); if (!live?.mail && !live?.devices.length && !edit.id) next(); }} />}
      </Dialog>
    </>
  );
}

function Editor({ id, initial, has, only, done }: { id?: number; initial: Form; has?: AccountView; only: boolean; done: (r: Saved, msg: string) => void }) {
  const [f, set] = useState(initial);
  const { busy, errors, submit } = useSubmit();
  const [removing, setRemoving] = useState(false);
  const toast = useToast();
  const up = (k: keyof Form) => (e: { target: { value: string } }) => set({ ...f, [k]: e.target.value });
  const input = (k: keyof Form, label: string, o: { hint?: string; optional?: boolean; ph?: string; cls?: string; mode?: "decimal" } = {}) => (
    <Field label={label} hint={o.hint} optional={o.optional} error={errors[k]}>{(a) => <input {...a} className={`field ${o.cls ?? ""}`} placeholder={o.ph} inputMode={o.mode} autoComplete="off" spellCheck={false} value={f[k] as string} onChange={up(k)} />}</Field>
  );
  const save = () => submit(async () => {
    const r = await api<Saved & { confirmed: number }>(id ? `/api/upi-accounts/${id}` : "/api/upi-accounts", id ? "PUT" : "POST", f);
    done(r, r.confirmed ? `Saved. ${r.confirmed} waiting payment${r.confirmed === 1 ? "" : "s"} confirmed.` : id ? "Account saved" : "Account added");
  });
  const remove = async () => {
    setRemoving(true);
    try {
      const r = await api<Saved & { result: "deleted" | "paused" }>(`/api/upi-accounts/${id}`, "DELETE");
      done(r, r.result === "deleted" ? "Account removed" : "Payments are still waiting on it, so it was paused instead");
    } catch (e) { toast(message(e), true); setRemoving(false); }
  };
  return (
    <form noValidate className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="flex-1 space-y-5 p-6">
        {input("label", "Name", { hint: "Only you see this, e.g. Counter 1 or ICICI current account." })}
        {input("upi_id", "UPI ID", { ph: "yourshop@okhdfcbank" })}
        {input("payee_name", "Name customers see")}
        <Field label="Bank" hint="Only this bank's alerts can confirm payments into this account.">
          {(a) => (
            <select {...a} className="field" value={f.bank_code} onChange={(e) => { const b = BANKS.find((x) => x.code === e.target.value); set({ ...f, bank_code: e.target.value, bank_name: b?.name ?? f.bank_name }); }}>
              <option value="any">Any supported bank</option>
              {BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("account_number", "Account number", { cls: "num", optional: true, ph: has?.has_account ? `•••• ${has.account_tail}` : "", hint: has?.has_account ? "Saved and encrypted. Blank keeps it." : "Its last digits are checked on every alert." })}
          <Field label="IFSC" optional error={errors.ifsc}>
            {(a) => <input {...a} className="field font-mono uppercase" maxLength={11} autoComplete="off" placeholder="HDFC0001234" value={f.ifsc} onChange={(e) => { const ifsc = e.target.value.toUpperCase(); const b = ifsc.length >= 4 ? bankByIfsc(ifsc) : undefined; set({ ...f, ifsc, ...(b ? { bank_code: b.code, bank_name: b.name } : {}) }); }} />}
          </Field>
          {input("account_holder", "Account holder", { optional: true })}
          {input("branch_name", "Branch", { optional: true })}
        </div>
        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          {input("daily_limit", "Daily limit (₹)", { optional: true, mode: "decimal", ph: "No limit", hint: "Stop using it once this much arrives in a day." })}
          {input("monthly_limit", "Monthly limit (₹)", { optional: true, mode: "decimal", ph: "No limit", hint: "e.g. 100000 for NPCI's small-merchant category." })}
        </div>
        <div className="space-y-4 border-t border-line pt-5">
          <Toggle label="Use for new payments" hint="Turn off to pause it. Payments already waiting still confirm." checked={f.active} onChange={(active) => set({ ...f, active })} />
          <Toggle label="Default account" hint="Used first when rotation is set to default first." checked={f.is_default} onChange={(is_default) => set({ ...f, is_default })} />
        </div>
        {errors.form && <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-carnelian">{errors.form}</p>}
      </div>
      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-line bg-paper px-6 py-4">
        <Button type="submit" busy={busy} className="flex-1">{id ? "Save account" : "Add account"}</Button>
        {id && !only && <Button variant="danger" busy={removing} onClick={remove}>Remove</Button>}
      </div>
    </form>
  );
}
