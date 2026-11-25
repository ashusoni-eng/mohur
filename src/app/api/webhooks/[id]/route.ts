import { json, merchantRoute } from "@/lib/server/http";
import { run } from "@/lib/server/db";
export const DELETE = merchantRoute<{ id: string }>((_r, m, { id }) => { run("DELETE FROM webhooks WHERE id=? AND merchant_id=?", id, m.id); return json({ ok: true }); });
