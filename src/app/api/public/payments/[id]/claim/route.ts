import { json, limit, publicPayment, publicRoute } from "@/lib/server/http";
import { claim } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
export const POST = publicRoute<{ id: string }>((req, { id }) => {
  const p = publicPayment(req.headers, id);
  limit(`claim:${p.id}`, 10, 60_000);
  return json(checkoutView(claim(p.id)));
});
