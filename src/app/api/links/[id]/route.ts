import { z } from "zod";
import { body, json, merchantRoute } from "@/lib/server/http";
import { ownedLink } from "@/lib/server/links";
import { run } from "@/lib/server/db";
export const PATCH = merchantRoute<{ id: string }>(async (req, m, { id }) => {
  const l = ownedLink(m.id, id);
  const { active } = await body(req, z.object({ active: z.boolean() }));
  run("UPDATE links SET active=? WHERE id=?", active ? 1 : 0, l.id);
  return json({ ok: true });
});
export const DELETE = merchantRoute<{ id: string }>((_r, m, { id }) => {
  run("DELETE FROM links WHERE id=?", ownedLink(m.id, id).id);
  return json({ ok: true });
});
