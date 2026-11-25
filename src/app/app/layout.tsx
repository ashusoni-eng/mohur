import { requireMerchant } from "@/lib/server/auth";
import { get } from "@/lib/server/db";
import { listDevices, mailStatus } from "@/lib/server/views";
import { LiveProvider } from "@/components/live";
import { ToastProvider } from "@/components/ui";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMerchant();
  const n = (sql: string) => get<{ n: number }>(sql, m.id)!.n;
  return (
    <LiveProvider
      initial={{
        v: 0,
        hold: n("SELECT COUNT(*) n FROM payments WHERE merchant_id=? AND status='on_hold'"),
        strays: n("SELECT COUNT(*) n FROM mails WHERE merchant_id=? AND outcome IN ('unmatched','ambiguous')"),
        mail: mailStatus(m.id),
        devices: listDevices(m.id),
      }}
    >
      <ToastProvider>
        <Shell name={m.name} business={m.business}>{children}</Shell>
      </ToastProvider>
    </LiveProvider>
  );
}
