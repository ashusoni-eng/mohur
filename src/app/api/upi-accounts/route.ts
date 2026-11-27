import { body, json, merchantRoute } from "@/lib/server/http";
import { accountsView, saveAccount } from "@/lib/server/accounts";
import { accountMismatch, recheckAccount } from "@/lib/server/mail/ingest";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((_r, m) => json({ rows: accountsView(m.id), mismatch: accountMismatch(m.id) }));
export const POST = merchantRoute(async (req, m) => {
  saveAccount(m.id, await body(req, S.upiAccount));
  // A new account can be the one an earlier alert named, so give those alerts another look.
  const confirmed = recheckAccount(m.id);
  return json({ rows: accountsView(m.id), mismatch: accountMismatch(m.id), confirmed }, 201);
});
