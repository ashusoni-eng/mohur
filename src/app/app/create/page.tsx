import { query, type Query } from "@/lib/query";
import { requireMerchant } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/payments";
import { hasChannel } from "@/lib/server/views";
import { CreateView } from "@/components/create";
export const metadata = { title: "Create payment" };
export default async function Page({ searchParams }: { searchParams: Query }) {
  const m = await requireMerchant();
  return <CreateView type={(await query(searchParams)).type === "qr" ? "qr" : "link"} ready={!!getSettings(m.id).upi_id} mail={hasChannel(m.id)} />;
}
