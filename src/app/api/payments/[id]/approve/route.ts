import { body, json, merchantRoute } from "@/lib/server/http";
import { approve } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const POST = merchantRoute<{ id: string }>(async (req, m, { id }) => json(approve(m.id, id, (await body(req, S.note)).note)));
