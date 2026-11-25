import { json, publicRoute } from "@/lib/server/http";
import { endSession } from "@/lib/server/auth";
export const POST = publicRoute(async () => { await endSession(); return json({ ok: true }); });
