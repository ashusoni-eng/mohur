import { apiRoute, body, json } from "@/lib/server/http";
import { createPayment } from "@/lib/server/payments";
import { listPayments } from "@/lib/server/views";
import { publicPayment } from "@/lib/server/webhooks";
import * as S from "@/lib/schemas";
export const POST = apiRoute(async (req, merchantId, _p, key) => {
  const b = await body(req, S.apiPayment);
  const p = createPayment({
    merchantId, source: "api", title: b.title || "Payment", amount: b.amount, reference: b.reference, note: b.note,
    customerName: b.customer?.name, customerContact: b.customer?.phone ?? b.customer?.contact, customerEmail: b.customer?.email,
    redirectUrl: b.redirect_url, upiAccountId: b.upi_account_id, test: key.test,
    idempotencyKey: req.headers.get("idempotency-key")?.slice(0, 120) || null,
  });
  return json(publicPayment(p), 201);
});
export const GET = apiRoute((req, merchantId, _p, key) => {
  const q = new URL(req.url).searchParams;
  const r = listPayments(merchantId, { status: q.get("status") ?? undefined, reference: q.get("reference")?.slice(0, 100) || undefined, test: key.test, page: Number(q.get("page")) || 1 });
  return json({ object: "list", livemode: !key.test, total: r.total, page: r.page, data: r.rows.map(publicPayment) });
});
