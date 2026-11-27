import { env } from "@/lib/server/env";
import { requireMerchant } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/payments";
import { Developers } from "@/components/developers";
export const metadata = { title: "Developers" };
export default async function Page() {
  const m = await requireMerchant();
  return <Developers base={env.appUrl} redirectHosts={getSettings(m.id).redirect_hosts} />;
}
