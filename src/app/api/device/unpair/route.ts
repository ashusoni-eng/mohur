import { deviceRoute } from "@/lib/server/http";
import { removeDevice } from "@/lib/server/devices";
export const POST = deviceRoute((d) => { removeDevice(d.merchant_id, d.id); return { ok: true }; });
