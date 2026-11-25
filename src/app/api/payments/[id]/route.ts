import { json, merchantRoute } from "@/lib/server/http";
import { getEvents, owned } from "@/lib/server/payments";
import { get } from "@/lib/server/db";
import type { Mail } from "@/lib/types";
export const GET = merchantRoute<{ id: string }>((_r, m, { id }) => {
  const p = owned(m.id, id);
  return json({ payment: p, events: getEvents(p.id), mail: p.mail_id ? get<Mail>("SELECT * FROM mails WHERE id=? AND merchant_id=?", p.mail_id, m.id) ?? null : null });
});
