import { body, json, merchantRoute } from "@/lib/server/http";
import { accountsView, removeAccount, saveAccount } from "@/lib/server/accounts";
import { accountMismatch, recheckAccount } from "@/lib/server/mail/ingest";
import * as S from "@/lib/schemas";
export const PUT = merchantRoute<{ id: string }>(async (req, m, { id }) => {
  saveAccount(m.id, await body(req, S.upiAccount), Number(id));
  const confirmed = recheckAccount(m.id);
  return json({ rows: accountsView(m.id), mismatch: accountMismatch(m.id), confirmed });
});
export const DELETE = merchantRoute<{ id: string }>((_r, m, { id }) => json({ result: removeAccount(m.id, Number(id)), rows: accountsView(m.id), mismatch: accountMismatch(m.id) }));
