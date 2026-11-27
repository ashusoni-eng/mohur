import { body, json, merchantRoute } from "@/lib/server/http";
import { createPayment } from "@/lib/server/payments";
import { checkoutView, listPayments } from "@/lib/server/views";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((req, m) => {
  const q = new URL(req.url).searchParams;
  return json(listPayments(m.id, { status: q.get("status") ?? undefined, q: q.get("q") ?? undefined, source: q.get("source") ?? undefined, test: q.get("test") === "1", page: Number(q.get("page")) || 1 }));
});
export const POST = merchantRoute(async (req, m) => {
  const b = await body(req, S.newQr);
  const p = createPayment({ merchantId: m.id, source: "qr", title: b.title || "Payment", amount: b.amount, customerName: b.customer || null });
  return json(checkoutView(p), 201);
});
