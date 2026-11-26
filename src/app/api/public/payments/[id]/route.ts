import { json, publicPayment, publicRoute } from "@/lib/server/http";
import { checkoutView } from "@/lib/server/views";
export const GET = publicRoute<{ id: string }>((req, { id }) => json(checkoutView(publicPayment(req.headers, id))));
