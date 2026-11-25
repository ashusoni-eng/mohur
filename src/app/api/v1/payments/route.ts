import { apiRoute, body, json } from "@/lib/server/http";
import { createPayment } from "@/lib/server/payments";
import { listPayments } from "@/lib/server/views";
import { publicPayment } from "@/lib/server/webhooks";
import * as S from "@/lib/schemas";
export const POST = apiRoute(async (req, merchantId) => {
  const b = await body(req, S.apiPayment);
  const p = createPayment({ merchantId, source: "api", title: b.title || "Payment", amount: b.amount, reference: b.reference, customerName: b.customer?.name, customerContact: b.customer?.contact, redirectUrl: b.redirect_url, idempotencyKey: req.headers.get("idempotency-key")?.slice(0, 120) || null });
  return json(publicPayment(p), 201);
});
export const GET = apiRoute((req, merchantId) => {
  const q = new URL(req.url).searchParams;
  const r = listPayments(merchantId, { status: q.get("status") ?? undefined, page: Number(q.get("page")) || 1 });
  return json({ object: "list", total: r.total, page: r.page, data: r.rows.map(publicPayment) });
});
