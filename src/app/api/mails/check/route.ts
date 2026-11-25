import { json, limit, merchantRoute } from "@/lib/server/http";
import { rescan } from "@/lib/server/mail/rescan";
/** Reads the last 24 hours of mail again. */
export const POST = merchantRoute(async (_r, m) => {
  limit(`rescan:${m.id}`, 10, 60_000);
  const r = await rescan(m.id, Date.now() - 86_400_000);
  return json({ ...r, alerts: r.alerts.slice(0, 20) });
});
