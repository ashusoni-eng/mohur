import { body, json, limit, publicPayment, publicRoute } from "@/lib/server/http";
import { simulate } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
import * as S from "@/lib/schemas";
// Only test payments: simulate() refuses anything that could carry real money.
export const POST = publicRoute<{ id: string }>(async (req, { id }) => {
  const p = publicPayment(req.headers, id);
  limit(`sim:${p.id}`, 10, 60_000);
  const { outcome } = await body(req, S.simulate);
  return json(checkoutView(simulate(p.id, outcome)));
});
