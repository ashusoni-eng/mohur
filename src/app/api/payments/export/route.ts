import { merchantRoute } from "@/lib/server/http";
import { listPayments } from "@/lib/server/views";
import { decimal } from "@/lib/money";
// A leading = + - @ would run as a formula when the file is opened in a spreadsheet.
const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export const GET = merchantRoute((req, m) => {
  const q = new URL(req.url).searchParams;
  const { rows } = listPayments(m.id, { status: q.get("status") ?? undefined, q: q.get("q") ?? undefined, source: q.get("source") ?? undefined, test: q.get("test") === "1", size: 50_000 });
  const head = ["Payment ID", "Created", "Status", "Title", "Amount", "Payable", "Source", "Verified by", "UTR", "Payer VPA", "Payer name", "Customer", "Contact", "Reference", "Settled", "Note"];
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : "");
  const lines = rows.map((p) => [p.id, iso(p.created_at), p.status, p.title, decimal(p.amount), decimal(p.payable), p.source, p.method, p.utr, p.payer_vpa, p.payer_name, p.customer_name, p.customer_contact, p.reference, iso(p.settled_at), p.decision_note].map(cell).join(","));
  return new Response("﻿" + [head.map(cell).join(","), ...lines].join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="mohur-payments.csv"`, "cache-control": "no-store" } });
});
