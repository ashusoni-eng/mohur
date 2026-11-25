import { apiRoute, json } from "@/lib/server/http";
import { owned } from "@/lib/server/payments";
import { publicPayment } from "@/lib/server/webhooks";
export const GET = apiRoute<{ id: string }>((_r, merchantId, { id }) => json(publicPayment(owned(merchantId, id))));
