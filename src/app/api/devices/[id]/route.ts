import { json, merchantRoute } from "@/lib/server/http";
import { removeDevice } from "@/lib/server/devices";
export const DELETE = merchantRoute<{ id: string }>((_r, m, { id }) => { removeDevice(m.id, id); return json({ ok: true }); });
