import { query, type Query } from "@/lib/query";
import { requireMerchant } from "@/lib/server/auth";
import { hasAccount } from "@/lib/server/accounts";
import { hasChannel } from "@/lib/server/views";
import { CreateView } from "@/components/create";
export const metadata = { title: "Create payment" };
export default async function Page({ searchParams }: { searchParams: Query }) {
  const m = await requireMerchant();
  return <CreateView type={(await query(searchParams)).type === "qr" ? "qr" : "link"} ready={hasAccount(m.id)} mail={hasChannel(m.id)} />;
}
