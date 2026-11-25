import { z } from "zod";
import { body, json, merchantRoute } from "@/lib/server/http";
import { linkMail } from "@/lib/server/mail/ingest";
export const POST = merchantRoute<{ id: string }>(async (req, m, { id }) => json(linkMail(m.id, Number(id), (await body(req, z.object({ paymentId: z.string().max(20) }))).paymentId)));
