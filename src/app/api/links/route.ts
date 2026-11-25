import { body, json, merchantRoute } from "@/lib/server/http";
import { createLink, linkUrl } from "@/lib/server/links";
import { listLinks } from "@/lib/server/views";
import { linkState } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((_r, m) => json({ rows: listLinks(m.id).map((l) => ({ ...l, url: linkUrl(l), state: linkState(l) })) }));
export const POST = merchantRoute(async (req, m) => {
  const b = await body(req, S.newLink);
  const l = createLink(m.id, { title: b.title, description: b.description, amount: b.openAmount ? null : b.amount || null, minAmount: b.openAmount ? b.minAmount || null : null, reusable: b.reusable, askName: b.askName, askContact: b.askContact, redirectUrl: b.redirectUrl, expiresAt: b.expiresInHours ? Date.now() + b.expiresInHours * 3600_000 : null });
  return json({ ...l, url: linkUrl(l) }, 201);
});
