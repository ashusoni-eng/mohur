import { publicPayment, publicRoute } from "@/lib/server/http";
import { getPayment } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
import { sse } from "@/lib/server/stream";
import { topics } from "@/lib/server/bus";
export const dynamic = "force-dynamic";
export const GET = publicRoute<{ id: string }>((req, { id }) => {
  const p = publicPayment(req.headers, id);
  return sse(req, topics.payment(p.id), () => checkoutView(getPayment(p.id)!));
});
