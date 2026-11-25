import { ip, json, limit, publicRoute } from "@/lib/server/http";
import { AppError, getPayment } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
export const GET = publicRoute<{ id: string }>((req, { id }) => {
  const p = getPayment(id);
  // Only misses count, so polling a real payment is never throttled but guessing IDs is.
  if (!p) { limit(`miss:${ip(req)}`, 30, 60_000); throw new AppError("No payment with that ID", 404, "not_found"); }
  return json(checkoutView(p));
});
