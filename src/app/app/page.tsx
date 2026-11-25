import { requireMerchant } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/payments";
import { hasChannel } from "@/lib/server/views";
import { DashboardView } from "@/components/dashboard";
export const metadata = { title: "Dashboard" };
export default async function Page() {
  const m = await requireMerchant();
  return <DashboardView setup={{ upi: !!getSettings(m.id).upi_id, mail: hasChannel(m.id) }} />;
}
