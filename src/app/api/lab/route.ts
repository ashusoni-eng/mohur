import { body, json, merchantRoute } from "@/lib/server/http";
import { ingest, ingestSms, screenFor } from "@/lib/server/mail/ingest";
import { fromAddresses } from "@/lib/server/mail/headers";
import { parseCredit } from "@/lib/server/mail/parse";
import { subjectLooksLikeCredit } from "@/lib/server/mail/screen";
import { bankCodes } from "@/lib/server/accounts";
import { screenSms } from "@/lib/server/mail/sms";
import { AppError, getSettings } from "@/lib/server/payments";
import { env } from "@/lib/server/env";
import { randomToken } from "@/lib/server/crypto";
import * as S from "@/lib/schemas";
/** Alert Lab: shows how a mail or SMS would be read. `inject` runs it through the real pipeline, for development. */
export const POST = merchantRoute(async (req, m) => {
  const b = await body(req, S.lab);
  if (b.channel === "sms") {
    if (b.inject) {
      if (!env.simulator) throw new AppError("The simulator is off on this server", 403, "forbidden");
      return json(ingestSms(m.id, { messageId: `lab-${randomToken(9)}`, sender: b.from, body: b.body, receivedAt: Date.now() }));
    }
    const st = getSettings(m.id);
    const screened = screenSms(b.from, b.body, { bankCodes: bankCodes(m.id), extraHeaders: st.extra_headers.split(/[\s,]+/).filter(Boolean) });
    return json({ subjectOk: !(screened.verdict === "skip" && screened.reason === "Not a credit alert"), screened, parsed: parseCredit("", b.body, { sms: true }) });
  }
  const from = fromAddresses(b.from);
  const host = from[0]?.split("@").pop() ?? "";
  const headers = { from, subject: b.subject, authResults: b.authenticated ? [`${env.authServId}; dmarc=pass header.from=${host}`] : [] };
  if (b.inject) {
    if (!env.simulator) throw new AppError("The simulator is off on this server", 403, "forbidden");
    return json({ outcome: await ingest(m.id, { messageId: `<lab-${randomToken(9)}>`, source: "lab", receivedAt: Date.now(), headers }, async () => ({ text: b.body })) });
  }
  const screened = screenFor(m.id, headers);
  return json({ subjectOk: subjectLooksLikeCredit(b.subject), screened, parsed: parseCredit(b.subject, b.body) });
});
