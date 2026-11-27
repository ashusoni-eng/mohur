import { apiRoute, body, json } from "@/lib/server/http";
import { createLink, linkUrl } from "@/lib/server/links";
import { AppError } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const POST = apiRoute(async (req, merchantId, _p, key) => {
  // A link takes real money from anyone who opens it, so it cannot be made in test mode.
  if (key.test) throw new AppError("Payment links are live only. Use a live key, or create test payments instead.", 403, "test_key");
  const b = await body(req, S.apiLink);
  const l = createLink(merchantId, { title: b.title, description: b.description, amount: b.amount, reusable: b.reusable, redirectUrl: b.redirect_url, expiresAt: b.expires_at ? Date.parse(b.expires_at) : null });
  return json({ id: l.id, object: "link", url: linkUrl(l), title: l.title, amount: l.amount, reusable: !!l.reusable, active: !!l.active }, 201);
});
