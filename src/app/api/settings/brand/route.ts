import { body, json, merchantRoute } from "@/lib/server/http";
import { run } from "@/lib/server/db";
import { settingsView } from "@/lib/server/views";
import { assertReadable, parseLogo } from "@/lib/server/brand";
import * as S from "@/lib/schemas";
/** logo: a data URL to replace it, null to remove it, left out to keep it. */
export const PUT = merchantRoute(async (req, m) => {
  const b = await body(req, S.brand);
  if (b.color) assertReadable(b.color);
  const logo = b.logo === undefined ? undefined : b.logo === null ? null : parseLogo(b.logo);
  if (logo === undefined) run("UPDATE settings SET brand_color=? WHERE merchant_id=?", b.color || null, m.id);
  else run("UPDATE settings SET brand_color=?, brand_logo=? WHERE merchant_id=?", b.color || null, logo, m.id);
  return json(settingsView(m.id));
});
