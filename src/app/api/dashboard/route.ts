import { json, merchantRoute } from "@/lib/server/http";
import { dashboard } from "@/lib/server/views";
export const GET = merchantRoute((req, m) => {
  const d = Number(new URL(req.url).searchParams.get("days"));
  return json(dashboard(m.id, [1, 7, 30, 90].includes(d) ? d : 30));
});
