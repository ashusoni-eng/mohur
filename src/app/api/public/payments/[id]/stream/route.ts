import { publicRoute } from "@/lib/server/http";
import { AppError, getPayment } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
import { sse } from "@/lib/server/stream";
import { topics } from "@/lib/server/bus";
export const dynamic = "force-dynamic";
export const GET = publicRoute<{ id: string }>((req, { id }) => {
  const p = getPayment(id);
  if (!p) throw new AppError("No payment with that ID", 404, "not_found");
  return sse(req, topics.payment(p.id), () => checkoutView(getPayment(p.id)!));
});
