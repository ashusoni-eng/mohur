import { apiRoute, body, json } from "@/lib/server/http";
import { AppError, owned, simulate } from "@/lib/server/payments";
import { publicPayment } from "@/lib/server/webhooks";
import * as S from "@/lib/schemas";
export const POST = apiRoute<{ id: string }>(async (req, merchantId, { id }, key) => {
  if (!key.test) throw new AppError("Use a test key to simulate payments. Live payments only move when money arrives.", 403, "live_key");
  const { outcome } = await body(req, S.simulate);
  return json(publicPayment(simulate(owned(merchantId, id).id, outcome)));
});
