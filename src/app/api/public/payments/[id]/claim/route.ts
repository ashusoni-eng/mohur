import { json, limit, publicRoute } from "@/lib/server/http";
import { claim } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
export const POST = publicRoute<{ id: string }>((_r, { id }) => { limit(`claim:${id}`, 10, 60_000); return json(checkoutView(claim(id))); });
