import { deviceRoute } from "@/lib/server/http";
import { hello } from "@/lib/server/devices";
import * as S from "@/lib/schemas";
export const POST = deviceRoute((d, raw) => hello(d, S.deviceHello.parse(JSON.parse(raw))));
