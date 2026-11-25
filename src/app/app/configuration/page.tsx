import { query, type Query } from "@/lib/query";
import { requireMerchant } from "@/lib/server/auth";
import { settingsView } from "@/lib/server/views";
import { env } from "@/lib/server/env";
import { Configuration } from "@/components/configuration";
export const metadata = { title: "Configuration" };
export default async function Page({ searchParams }: { searchParams: Query }) {
  const m = await requireMerchant();
  const q = await query(searchParams);
  return <Configuration welcome={!!q.welcome} error={q.error ?? null} connected={!!q.connected} settings={settingsView(m.id)} me={{ name: m.name, business: m.business, email: m.email }} google={!!env.google} simulator={env.simulator} />;
}
