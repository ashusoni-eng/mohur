import { body, json, limit, publicRoute } from "@/lib/server/http";
import { submitUtr } from "@/lib/server/mail/ingest";
import { checkoutView } from "@/lib/server/views";
import * as S from "@/lib/schemas";
export const POST = publicRoute<{ id: string }>(async (req, { id }) => {
  // Few tries per payment: a UTR is proof, so it must not be guessable.
  limit(`utr:${id.toUpperCase()}`, 5, 3600_000);
  return json(checkoutView(submitUtr(id, (await body(req, S.utr)).utr)));
});
