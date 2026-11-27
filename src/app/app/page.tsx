import { requireMerchant } from "@/lib/server/auth";
import { hasAccount } from "@/lib/server/accounts";
import { hasChannel } from "@/lib/server/views";
import { DashboardView } from "@/components/dashboard";
export const metadata = { title: "Dashboard" };
export default async function Page() {
  const m = await requireMerchant();
  return <DashboardView setup={{ upi: hasAccount(m.id), mail: hasChannel(m.id) }} />;
}
