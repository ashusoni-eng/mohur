import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { GithubMark } from "@/components/github";
import { CopyButton } from "@/components/ui";
import { env } from "@/lib/server/env";
import { repoUrl } from "@/lib/server/github";

export const metadata: Metadata = {
  title: "API reference: UPI payments API with test mode and webhooks",
  description: "Mohur's REST API for UPI payments: create a payment and QR, look it up by payment ID or your order number, test mode with simulated outcomes, signed webhooks, and examples in curl, Node.js, PHP and Python.",
  alternates: { canonical: "/docs" },
};

export const dynamic = "force-dynamic";
const B = env.appUrl;

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="relative my-4 overflow-hidden rounded-[11px] bg-deep">
      {lang && <span className="absolute left-4 top-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-brass-lt/80">{lang}</span>}
      <CopyButton text={children} className="absolute right-2 top-2 !text-white/75 hover:!bg-white/10" />
      <pre className={`overflow-x-auto p-5 pr-24 font-mono text-[13px] leading-relaxed text-[#d5e6dc] ${lang ? "pt-9" : ""}`}><code>{children}</code></pre>
    </div>
  );
}
const C = ({ children }: { children: React.ReactNode }) => <code className="rounded-[5px] bg-sunk px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>;
function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-8 border-t border-line pt-10 font-display text-[28px] leading-tight first:border-0 first:pt-0"><a href={`#${id}`} className="hover:text-emerald">{children}</a></h2>;
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-[11px] border border-line">
      <table className="w-full text-left text-[15px]">
        <thead className="bg-sunk text-[13px] text-ink-3"><tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? "whitespace-nowrap font-mono text-[14px]" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const NAV = [["start", "Quick start"], ["auth", "Keys and test mode"], ["create", "Create a payment"], ["get", "Look up a payment"], ["list", "List payments"], ["simulate", "Simulate (test mode)"], ["links", "Payment links"], ["redirects", "Redirects"], ["webhooks", "Webhooks"], ["verify", "Verify a webhook"], ["statuses", "Statuses"], ["errors", "Errors and limits"]];

export default function Docs() {
  const ld = { "@context": "https://schema.org", "@type": "TechArticle", headline: "Mohur API reference", about: "UPI payments API", url: `${B}/docs`, isPartOf: { "@type": "SoftwareApplication", name: "Mohur", url: B } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <header className="bg-deep text-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5">
          <Link href="/" className="text-brass-lt"><Wordmark size={32} /></Link>
          <nav className="flex items-center gap-5 text-white/80"><Link href="/signup" className="hover:text-white">Create account</Link><a href={repoUrl} target="_blank" rel="noreferrer" aria-label="Mohur on GitHub" className="hover:text-white"><GithubMark size={22} /></a></nav>
        </div>
        <div className="mx-auto max-w-[1180px] px-6 pb-12 pt-6">
          <p className="font-semibold text-brass-lt">Developers</p>
          <h1 className="mt-2 font-display text-[clamp(34px,4.5vw,52px)] leading-tight">Mohur API reference</h1>
          <p className="mt-3 max-w-[64ch] text-[18px] text-white/85">Create UPI payments from your own site, find them by your order number, try everything in test mode, and get a signed webhook the moment the bank confirms. JSON over HTTPS. Amounts are in paise.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1180px] gap-10 px-6 py-12 lg:grid-cols-[210px_1fr]">
        <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[15px] lg:flex-col">{NAV.map(([id, t]) => <li key={id}><a href={`#${id}`} className="text-ink-2 hover:text-emerald">{t}</a></li>)}</ul>
        </nav>
        <article className="min-w-0 max-w-[820px] space-y-5 text-[16px] leading-relaxed text-ink-2 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink">
          <H id="start">Quick start</H>
          <ol className="list-decimal space-y-1 pl-6">
            <li>Create an account, add a UPI account under <b>Configuration</b>, and connect Gmail or the Android SMS app.</li>
            <li>Under <b>Developers</b>, create a <b>test</b> key. It starts with <C>mhr_test_</C>.</li>
            <li>Create a payment, send the customer to <C>checkout_url</C>, and listen for <C>payment.paid</C>.</li>
            <li>Swap in a <C>mhr_live_</C> key when you are ready. Nothing else changes.</li>
          </ol>
          <Code lang="curl">{`curl ${B}/api/v1/payments \\
  -H "Authorization: Bearer mhr_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 49900, "title": "Order 1042", "reference": "order-1042" }'`}</Code>

          <H id="auth">Keys and test mode</H>
          <p>Send your key as <C>Authorization: Bearer &lt;key&gt;</C>. Keys are stored as a hash; you see one only when you create it. Keep it on your server, never in a browser or app.</p>
          <Table head={["Key", "What it does"]} rows={[
            ["mhr_live_…", "Real payments: a real QR for your UPI ID, confirmed from your bank's email or SMS. Sends to live webhooks."],
            ["mhr_test_…", <>Test payments: no UPI ID is shown and nothing is matched to your bank. You move them with <a href="#simulate" className="text-emerald underline">simulate</a>. They stay out of the dashboard totals and only reach test webhooks. Every object has <C>livemode: false</C>.</>],
          ]} />
          <p>A key only ever sees payments of its own mode. Keys created before test mode existed (<C>mhr_…</C>) are live keys.</p>

          <H id="create">Create a payment</H>
          <p><C>POST /api/v1/payments</C>. Returns <C>201</C> with the <a href="#object" className="text-emerald underline">payment object</a>.</p>
          <Table head={["Field", "Description"]} rows={[
            ["amount", "Required. Integer paise, 100 to 10000000 (₹1 to ₹1,00,000)."],
            ["title", "Shown to the customer. Up to 100 characters."],
            ["reference", "Your order number. Lets you look the payment up later without storing Mohur's ID."],
            ["note", "Up to 50 characters, shown in the customer's UPI app next to the payment ID."],
            ["customer.name / .email / .phone", "Optional. Shown on your dashboard and in webhooks."],
            ["redirect_url", <>Where to send the customer after paying. Must match your <a href="#redirects" className="text-emerald underline">allowed domains</a> if you set any.</>],
            ["upi_account_id", "Optional. Pin the payment to one of your UPI accounts instead of using rotation."],
          ]} />
          <p>Send an <C>Idempotency-Key</C> header to retry safely: the same key returns the same payment instead of creating a second one.</p>
          <p>The response also carries <C>upi_intent</C>, a <C>upi://pay</C> link. On a phone, open it to jump straight into the customer&apos;s UPI app, or draw it as your own QR.</p>
          <h3>Node.js</h3>
          <Code lang="js">{`const res = await fetch("${B}/api/v1/payments", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.MOHUR_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": "order-1042",
  },
  body: JSON.stringify({
    amount: 49900,
    title: "Order 1042",
    reference: "order-1042",
    customer: { name: "Asha", email: "asha@example.com" },
    redirect_url: "https://yourshop.in/thanks",
  }),
});
const payment = await res.json();
// Send the customer to payment.checkout_url`}</Code>
          <h3>PHP</h3>
          <Code lang="php">{`<?php
$ch = curl_init("${B}/api/v1/payments");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("MOHUR_KEY"),
    "Content-Type: application/json",
    "Idempotency-Key: order-1042",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "amount" => 49900,
    "title" => "Order 1042",
    "reference" => "order-1042",
    "redirect_url" => "https://yourshop.in/thanks",
  ]),
]);
$payment = json_decode(curl_exec($ch), true);
header("Location: " . $payment["checkout_url"]);`}</Code>
          <h3>Python</h3>
          <Code lang="python">{`import os, requests

r = requests.post(
    "${B}/api/v1/payments",
    headers={"Authorization": f"Bearer {os.environ['MOHUR_KEY']}", "Idempotency-Key": "order-1042"},
    json={"amount": 49900, "title": "Order 1042", "reference": "order-1042"},
    timeout=10,
)
payment = r.json()`}</Code>
          <h3 id="object">The payment object</h3>
          <Code lang="json">{`{
  "id": "7F3A9C21B0",
  "object": "payment",
  "status": "pending",
  "amount": 49900,
  "amount_payable": 49903,
  "currency": "INR",
  "title": "Order 1042",
  "reference": "order-1042",
  "note": null,
  "source": "api",
  "link_id": null,
  "livemode": true,
  "customer": { "name": "Asha", "contact": null, "email": "asha@example.com" },
  "utr": null,
  "payer_vpa": null,
  "payer_name": null,
  "verified_by": null,
  "checkout_url": "${B}/checkout/7F3A9C21B0",
  "upi_intent": "upi://pay?pa=shop@okhdfcbank&pn=Shop&am=499.03&cu=INR&tn=7F3A9C21B0",
  "created_at": "2026-11-27T10:00:00.000Z",
  "settled_at": null
}`}</Code>
          <p><C>amount_payable</C> can be a few paise above <C>amount</C>: the paise tell two payments of the same price apart. The customer pays the exact payable amount.</p>

          <H id="get">Look up a payment</H>
          <p><C>GET /api/v1/payments/&#123;id or reference&#125;</C>. Pass Mohur&apos;s 10-character payment ID, or the <C>reference</C> you sent. If several payments share a reference, the newest is returned.</p>
          <Code lang="curl">{`curl ${B}/api/v1/payments/order-1042 -H "Authorization: Bearer mhr_live_..."`}</Code>
          <p>After a customer is redirected back to you, always look the payment up here before you deliver. The address bar can be edited; this answer cannot.</p>

          <H id="list">List payments</H>
          <p><C>GET /api/v1/payments?status=paid&amp;reference=order-1042&amp;page=1</C>. 25 per page, newest first. <C>status</C> is one of the <a href="#statuses" className="text-emerald underline">statuses</a>, or <C>open</C> for pending and verifying.</p>

          <H id="simulate">Simulate (test mode)</H>
          <p><C>POST /api/v1/payments/&#123;id&#125;/simulate</C> with <C>{`{"outcome": "paid"}`}</C>, <C>on_hold</C>, <C>declined</C> or <C>expired</C>. Test keys only. The payment moves exactly as a real one would, and the same webhooks fire. The test checkout page has the same buttons, so you can click through your own flow.</p>
          <Code lang="curl">{`curl ${B}/api/v1/payments/7F3A9C21B0/simulate \\
  -H "Authorization: Bearer mhr_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "outcome": "paid" }'`}</Code>

          <H id="links">Payment links</H>
          <p><C>POST /api/v1/links</C> with <C>title</C>, and optionally <C>amount</C> (paise; leave out to let the customer type it), <C>description</C>, <C>reusable</C>, <C>redirect_url</C> and <C>expires_at</C> (ISO 8601). Returns the link&apos;s <C>url</C>. Links take real money from anyone who opens them, so they need a live key.</p>

          <H id="redirects">Redirects</H>
          <p>When a payment is confirmed, the checkout page counts down and sends the customer to <C>redirect_url</C> with <C>?payment_id=</C> added. List your domains under <b>Developers → Allowed redirect domains</b> and any other <C>redirect_url</C> is refused with <C>422 redirect_not_allowed</C>. Do this before going live: it stops a leaked key from sending your customers to someone else&apos;s site.</p>

          <H id="webhooks">Webhooks</H>
          <p>Add an endpoint under <b>Developers → Webhooks</b> and choose live or test. Mohur sends a <C>POST</C> with a JSON body for every change. Answer with any 2xx within 10 seconds. Failures are retried after 30 s, 2 min, 10 min, 1 h and 6 h.</p>
          <Table head={["Event", "When"]} rows={[
            ["payment.created", "A payment was created."],
            ["payment.paid", "The bank confirmed it, or you approved it."],
            ["payment.on_hold", "No bank alert arrived in time. It can still become paid."],
            ["payment.declined", "You declined it."],
            ["payment.expired", "Abandoned: nobody said they paid and no money arrived."],
          ]} />
          <Table head={["Header", "Meaning"]} rows={[
            ["mohur-signature", <><C>t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256&gt;</C> of <C>t + "." + raw body</C>, keyed with the endpoint&apos;s signing secret.</>],
            ["mohur-event", "The event type, as in the body."],
            ["mohur-event-id", "Same in every retry. Store it and skip events you have already handled."],
            ["mohur-sequence", "Counts up for each event of a payment. Retries can arrive out of order, so ignore a sequence lower than the last one you applied."],
          ]} />
          <Code lang="json">{`{
  "id": "evt_3kq9x0f2m1ab",
  "type": "payment.paid",
  "sequence": 2,
  "livemode": true,
  "created_at": "2026-11-27T10:00:41.000Z",
  "data": { "id": "7F3A9C21B0", "status": "paid", "utr": "432178650123", "...": "the payment object" }
}`}</Code>

          <H id="verify">Verify a webhook</H>
          <p>Check the signature against the <b>raw</b> body, before parsing it, and reject anything older than five minutes.</p>
          <h3>Node.js</h3>
          <Code lang="js">{`import crypto from "node:crypto";

export function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const want = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return v1?.length === want.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(want));
}`}</Code>
          <h3>PHP</h3>
          <Code lang="php">{`<?php
function mohur_verify(string $raw, string $header, string $secret): bool {
  parse_str(str_replace(",", "&", $header), $p);
  if (abs(time() - (int)($p["t"] ?? 0)) > 300) return false;
  $want = hash_hmac("sha256", $p["t"] . "." . $raw, $secret);
  return hash_equals($want, $p["v1"] ?? "");
}

$raw = file_get_contents("php://input");
if (!mohur_verify($raw, $_SERVER["HTTP_MOHUR_SIGNATURE"] ?? "", getenv("MOHUR_WEBHOOK_SECRET"))) {
  http_response_code(400); exit;
}
$event = json_decode($raw, true);`}</Code>
          <h3>Python</h3>
          <Code lang="python">{`import hashlib, hmac, time

def verify(raw: bytes, header: str, secret: str) -> bool:
    p = dict(part.split("=", 1) for part in header.split(","))
    if abs(time.time() - int(p.get("t", 0))) > 300:
        return False
    want = hmac.new(secret.encode(), f"{p['t']}.".encode() + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, p.get("v1", ""))`}</Code>

          <H id="statuses">Statuses</H>
          <Table head={["Status", "Meaning"]} rows={[
            ["pending", "QR shown, waiting for the customer."],
            ["verifying", "The customer said they paid. Waiting for the bank alert."],
            ["on_hold", "No alert in time. Becomes paid if the money arrives or you approve it."],
            ["paid", "Final. Deliver the order."],
            ["declined", "Final. You declined it."],
            ["expired", "Abandoned. Can still become paid if the customer proves payment by UTR."],
          ]} />

          <H id="errors">Errors and limits</H>
          <p>Errors are JSON: <C>{`{"error": "message", "code": "invalid_request", "field": "amount"}`}</C>. <C>field</C> is there when one input is at fault.</p>
          <Table head={["HTTP", "code", "When"]} rows={[
            ["400", "invalid_request", "A field is missing or wrong."],
            ["401", "unauthorized", "Missing or unknown API key."],
            ["403", "live_key / test_key", "The call needs the other kind of key."],
            ["404", "not_found", "No such payment for this key's mode."],
            ["409", "idempotency_conflict", "The Idempotency-Key was used with a different amount."],
            ["409", "already_final / invalid_state", "The payment cannot move that way."],
            ["409", "not_configured", "Add a UPI account first."],
            ["422", "redirect_not_allowed", "redirect_url is not on your allowed domains."],
            ["422", "invalid_request", "Every UPI account has reached its daily or monthly limit."],
            ["429", "rate_limited", "Over 120 requests a minute for this key."],
          ].map(([a, b, c]) => [a, <C key="c">{b}</C>, c])} />
          <p className="pt-6 text-[15px] text-ink-3">Mohur is open source under the MIT licence. Found something unclear? <a href={`${repoUrl}/issues`} target="_blank" rel="noreferrer" className="text-emerald underline">Open an issue on GitHub</a>.</p>
        </article>
      </div>
    </>
  );
}
