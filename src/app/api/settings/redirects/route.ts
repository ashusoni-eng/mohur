import { body, json, merchantRoute } from "@/lib/server/http";
import { run } from "@/lib/server/db";
import { settingsView } from "@/lib/server/views";
import * as S from "@/lib/schemas";
export const PUT = merchantRoute(async (req, m) => {
  const { redirect_hosts } = await body(req, S.redirectHosts);
  run("UPDATE settings SET redirect_hosts=? WHERE merchant_id=?", redirect_hosts, m.id);
  return json(settingsView(m.id));
});
