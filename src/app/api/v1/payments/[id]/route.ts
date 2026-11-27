import { apiRoute, json } from "@/lib/server/http";
import { get } from "@/lib/server/db";
import { AppError, getPayment } from "@/lib/server/payments";
import { publicPayment } from "@/lib/server/webhooks";
import type { Payment } from "@/lib/types";

/** By Mohur's payment ID, or by your own order number (the reference you sent). Newest wins. */
export const GET = apiRoute<{ id: string }>((_r, merchantId, { id }, key) => {
  const ref = decodeURIComponent(id).slice(0, 100);
  const byId = /^[0-9a-f]{10}$/i.test(ref) ? getPayment(ref) : undefined;
  const p = byId && byId.merchant_id === merchantId && !!byId.test === key.test ? byId
    : get<Payment>("SELECT * FROM payments WHERE merchant_id=? AND test=? AND reference=? ORDER BY created_at DESC LIMIT 1", merchantId, key.test ? 1 : 0, ref);
  if (!p) throw new AppError(key.test ? "No test payment with that ID or reference" : "No payment with that ID or reference", 404, "not_found");
  return json(publicPayment(p));
});
