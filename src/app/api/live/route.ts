import { merchantRoute } from "@/lib/server/http";
import { sse } from "@/lib/server/stream";
import { topics } from "@/lib/server/bus";
import { listDevices, mailStatus } from "@/lib/server/views";
import { get } from "@/lib/server/db";
export const dynamic = "force-dynamic";
/** One stream per admin tab: a version that changes whenever anything does, plus sidebar badges. */
export const GET = merchantRoute((req, m) =>
  sse(req, topics.merchant(m.id), () => ({
    v: Date.now(),
    hold: get<{ n: number }>("SELECT COUNT(*) n FROM payments WHERE merchant_id=? AND test=0 AND status='on_hold'", m.id)!.n,
    strays: get<{ n: number }>("SELECT COUNT(*) n FROM mails WHERE merchant_id=? AND outcome IN ('unmatched','ambiguous')", m.id)!.n,
    mail: mailStatus(m.id),
    devices: listDevices(m.id),
  })),
);
