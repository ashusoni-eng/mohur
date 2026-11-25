import { json, merchantRoute } from "@/lib/server/http";
import { dismissMail } from "@/lib/server/mail/ingest";
export const POST = merchantRoute<{ id: string }>((_r, m, { id }) => { dismissMail(m.id, Number(id)); return json({ ok: true }); });
