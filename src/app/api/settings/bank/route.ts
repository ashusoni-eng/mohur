import { body, json, merchantRoute } from "@/lib/server/http";
import { encrypt } from "@/lib/server/crypto";
import { run } from "@/lib/server/db";
import { recheckAccount } from "@/lib/server/mail/ingest";
import { settingsView } from "@/lib/server/views";
import * as S from "@/lib/schemas";
export const PUT = merchantRoute(async (req, m) => {
  const b = await body(req, S.bank);
  run("UPDATE settings SET upi_id=?, payee_name=?, account_holder=?, ifsc=?, bank_name=?, branch_name=?, bank_code=? WHERE merchant_id=?", b.upi_id, b.payee_name, b.account_holder, b.ifsc, b.bank_name, b.branch_name, b.bank_code, m.id);
  // Left blank means "keep the saved number": it is never sent back to the browser.
  if (b.account_number) run("UPDATE settings SET account_number_enc=?, account_tail=? WHERE merchant_id=?", encrypt(b.account_number), b.account_number.slice(-4), m.id);
  const confirmed = recheckAccount(m.id);
  return json({ ...settingsView(m.id), confirmed });
});
