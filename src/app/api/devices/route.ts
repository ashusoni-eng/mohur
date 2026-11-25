import { body, json, limit, merchantRoute } from "@/lib/server/http";
import { startPairing } from "@/lib/server/devices";
import { listDevices } from "@/lib/server/views";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((_r, m) => json({ rows: listDevices(m.id) }));
export const POST = merchantRoute(async (req, m) => {
  limit(`pair:${m.id}`, 20, 10 * 60_000);
  return json(startPairing(m.id, (await body(req, S.newDevice)).label), 201);
});
