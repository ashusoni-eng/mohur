import { json, merchantRoute } from "@/lib/server/http";
import { candidates, listMails } from "@/lib/server/views";
export const GET = merchantRoute((req, m) => {
  const rows = listMails(m.id, new URL(req.url).searchParams.get("tab") ?? "all");
  return json({ rows: rows.map((r) => ({ ...r, candidates: r.outcome === "unmatched" || r.outcome === "ambiguous" ? candidates(m.id, r) : [] })) });
});
