"use client";
import { useState } from "react";
import { KeyRound, Plus, RotateCw, Trash2 } from "lucide-react";
import { api, ago, fmtDay, fmtTime, message } from "@/lib/client";
import { useApi, useSubmit } from "./live";
import { Button, CopyButton, Dialog, Field, PageHead, Segmented, useToast } from "./ui";

type Key = { id: string; label: string; prefix: string; created_at: number; last_used_at: number | null };
type Hook = { id: string; url: string; created_at: number };
type Del = { id: string; event: string; payment_id: string; status: "queued" | "delivered" | "failed"; attempts: number; code: number | null; error: string | null; next_at: number | null; created_at: number };

export function Developers({ base }: { base: string }) {
  const [tab, setTab] = useState("keys");
  return (
    <>
      <PageHead title="Developers" sub="Create payments from your own site, and hear back the moment they settle.">
        <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: "keys", label: "API keys" }, { value: "webhooks", label: "Webhooks" }, { value: "docs", label: "Reference" }]} />
      </PageHead>
      {tab === "keys" && <Keys />}
      {tab === "webhooks" && <Hooks />}
      {tab === "docs" && <Docs base={base} />}
    </>
  );
}

function Secret({ title, value, text, onClose }: { title: string; value: string | null; text: string; onClose: () => void }) {
  return <Dialog open={!!value} onClose={onClose} title={title}>{value && <div className="p-6"><p className="text-ink-2">{text}</p><div className="mt-4 break-all rounded-[10px] bg-sunk p-4 font-mono text-[14px]">{value}</div><div className="mt-5 flex items-center justify-end gap-3"><CopyButton text={value} /><Button onClick={onClose}>I have saved it</Button></div></div>}</Dialog>;
}

function Keys() {
  const { data, reload } = useApi<{ rows: Key[] }>("/api/keys");
  const [label, setLabel] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const { busy, errors, submit } = useSubmit();
  const toast = useToast();
  return (
    <section className="card p-6 sm:p-8">
      <form noValidate className="flex flex-wrap items-start gap-3" onSubmit={(e) => { e.preventDefault(); void submit(async () => { setMade((await api<{ key: string }>("/api/keys", "POST", { label })).key); setLabel(""); await reload(); }); }}>
        <div className="min-w-[220px] flex-1"><Field label="New API key" error={errors.label ?? errors.form}>{(a) => <input {...a} className="field" placeholder="Where will you use it?" value={label} onChange={(e) => setLabel(e.target.value)} />}</Field></div>
        <Button type="submit" busy={busy} className="mt-[27px]"><Plus size={16} />Create key</Button>
      </form>
      <ul className="mt-7 divide-y divide-line border-t border-line">
        {data?.rows.map((k) => (
          <li key={k.id} className="flex items-center gap-4 py-4">
            <KeyRound size={18} className="shrink-0 text-brass-mid" />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{k.label}</p><p className="text-[13px] text-ink-3"><span className="font-mono">{k.prefix}…</span> · created {fmtDay(k.created_at)} · {k.last_used_at ? `used ${ago(k.last_used_at)}` : "never used"}</p></div>
            <Button size="sm" variant="danger" onClick={async () => { try { await api(`/api/keys/${k.id}`, "DELETE"); toast("Key revoked"); await reload(); } catch (e) { toast(message(e), true); } }}>Revoke</Button>
          </li>
        ))}
        {data?.rows.length === 0 && <li className="py-6 text-ink-3">No API keys yet.</li>}
      </ul>
      <Secret title="Your new API key" value={made} onClose={() => setMade(null)} text="Copy it now. It is stored only as a hash and cannot be shown again." />
    </section>
  );
}

const DEL = { delivered: "bg-jade-wash text-[#125a40]", queued: "bg-lapis-wash text-lapis", failed: "bg-carnelian-wash text-carnelian" };
function Hooks() {
  const { data, reload } = useApi<{ rows: Hook[]; deliveries: Del[] }>("/api/webhooks");
  const [url, setUrl] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const { busy, errors, submit } = useSubmit();
  const toast = useToast();
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); await reload(); } catch (e) { toast(message(e), true); } };
  return (
    <div className="space-y-5">
      <section className="card p-6 sm:p-8">
        <form noValidate className="flex flex-wrap items-start gap-3" onSubmit={(e) => { e.preventDefault(); void submit(async () => { setMade((await api<{ secret: string }>("/api/webhooks", "POST", { url })).secret); setUrl(""); await reload(); }); }}>
          <div className="min-w-[220px] flex-1"><Field label="New endpoint" error={errors.url ?? errors.form}>{(a) => <input {...a} className="field" type="url" placeholder="https://yoursite.in/webhooks/mohur" value={url} onChange={(e) => setUrl(e.target.value)} />}</Field></div>
          <Button type="submit" busy={busy} className="mt-[27px]"><Plus size={16} />Add endpoint</Button>
        </form>
        <ul className="mt-7 divide-y divide-line border-t border-line">
          {data?.rows.map((h) => <li key={h.id} className="flex items-center gap-4 py-3.5"><span className="min-w-0 flex-1 truncate font-mono text-[14px]">{h.url}</span><Button size="sm" variant="ghost" aria-label={`Remove ${h.url}`} onClick={() => act(() => api(`/api/webhooks/${h.id}`, "DELETE"), "Endpoint removed")}><Trash2 size={16} /></Button></li>)}
          {data?.rows.length === 0 && <li className="py-6 text-ink-3">No endpoints yet.</li>}
        </ul>
      </section>
      <section className="card p-6 sm:p-8">
        <h2 className="font-display text-[20px]">Recent deliveries</h2>
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {data?.deliveries.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold capitalize leading-none ${DEL[d.status]}`}>{d.status}</span>
              <span className="min-w-0 flex-1 basis-[240px]"><span className="font-mono text-[14px]">{d.event}</span> <span className="font-mono text-[13px] text-ink-3">{d.payment_id}</span><span className="num block text-[13px] text-ink-3">{fmtTime(d.created_at)} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}{d.error ? ` · ${d.error}` : d.code ? ` · ${d.code}` : ""}</span></span>
              {d.status !== "delivered" && <Button size="sm" variant="quiet" onClick={() => act(() => api(`/api/webhooks/deliveries/${d.id}`, "POST", {}), "Sending again")}><RotateCw size={14} />Send now</Button>}
            </li>
          ))}
          {data?.deliveries.length === 0 && <li className="py-6 text-ink-3">Events will be listed here as they are sent.</li>}
        </ul>
      </section>
      <Secret title="Signing secret" value={made} onClose={() => setMade(null)} text="Use this to verify that events came from Mohur. It cannot be shown again." />
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <div className="relative mt-4 overflow-hidden rounded-[11px] bg-deep"><CopyButton text={children} className="absolute right-2 top-2 !text-white/75 hover:!bg-white/10" /><pre className="overflow-x-auto p-5 pr-24 font-mono text-[13px] leading-relaxed text-[#d5e6dc]"><code>{children}</code></pre></div>;
}
function Docs({ base }: { base: string }) {
  const H = ({ t, c }: { t: string; c: string }) => <><h2 className="font-display text-[20px]">{t}</h2><p className="mt-1 max-w-[68ch] text-ink-2">{c}</p></>;
  return (
    <div className="max-w-[860px] space-y-5">
      <section className="card p-6 sm:p-8"><H t="Create a payment" c="Amounts are in paise. Send the customer to checkout_url. Repeat a request safely by reusing the same Idempotency-Key." />
        <Code>{`curl ${base}/api/v1/payments \\
  -H "Authorization: Bearer mhr_..." \\
  -H "Idempotency-Key: order-1042" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 49900,
    "title": "Order 1042",
    "reference": "order-1042",
    "customer": { "name": "Asha", "contact": "asha@example.com" },
    "redirect_url": "https://yoursite.in/thanks"
  }'`}</Code>
      </section>
      <section className="card p-6 sm:p-8"><H t="Check a payment" c="Status is one of pending, verifying, on_hold, paid, declined or expired. After a redirect, always check here before delivering: the address bar can be edited." />
        <Code>{`curl ${base}/api/v1/payments/7F3A9C21B0 -H "Authorization: Bearer mhr_..."`}</Code>
        <p className="mt-4 text-[14px] text-ink-3">Also available: <span className="font-mono">GET /api/v1/payments?status=paid&amp;page=1</span> and <span className="font-mono">POST /api/v1/links</span>.</p>
      </section>
      <section className="card p-6 sm:p-8"><H t="Verify a webhook" c="Events: payment.created, payment.on_hold, payment.paid, payment.declined, payment.expired. Failed deliveries are retried five more times over about eight hours. Events can repeat, so make your handler idempotent." />
        <Code>{`import crypto from "node:crypto";

export function verify(rawBody: string, header: string, secret: string) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const want = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return v1?.length === want.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(want));
}

// header: request.headers["mohur-signature"]`}</Code>
      </section>
    </div>
  );
}
