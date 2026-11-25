import { body, json, merchantRoute } from "@/lib/server/http";
import { decline } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const POST = merchantRoute<{ id: string }>(async (req, m, { id }) => json(decline(m.id, id, (await body(req, S.note)).note)));
