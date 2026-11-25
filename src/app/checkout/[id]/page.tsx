import { getPayment } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
import { Checkout } from "@/components/checkout";
import { Notice, PublicFrame } from "@/components/public-frame";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pay", robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = getPayment((await params).id);
  return <PublicFrame>{p ? <Checkout initial={checkoutView(p)} /> : <Notice title="No payment with that ID">Check the address, or go back to the link you were sent.</Notice>}</PublicFrame>;
}
