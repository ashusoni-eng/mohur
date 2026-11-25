import { body, json, merchantRoute } from "@/lib/server/http";
import { run } from "@/lib/server/db";
import { settingsView } from "@/lib/server/views";
import * as S from "@/lib/schemas";
export const PUT = merchantRoute(async (req, m) => {
  const b = await body(req, S.rules);
  run("UPDATE settings SET verify_seconds=?, qr_minutes=?, hold_minutes=?, timer_start=?, amount_mode=?, show_bank=?, support_contact=?, extra_domains=?, extra_headers=? WHERE merchant_id=?", b.verify_seconds, b.qr_minutes, b.hold_minutes, b.timer_start, b.amount_mode, b.show_bank ? 1 : 0, b.support_contact, b.extra_domains, b.extra_headers, m.id);
  return json(settingsView(m.id));
});
