import { deviceRoute } from "@/lib/server/http";
import { receive } from "@/lib/server/devices";
import * as S from "@/lib/schemas";
export const POST = deviceRoute((d, raw) => receive(d, S.deviceSms.parse(JSON.parse(raw))));
