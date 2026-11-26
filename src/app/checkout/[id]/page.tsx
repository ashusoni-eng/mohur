import { headers } from "next/headers";
import { publicPayment } from "@/lib/server/http";
import { AppError } from "@/lib/server/payments";
import { checkoutView } from "@/lib/server/views";
import { Checkout } from "@/components/checkout";
import { Notice, PublicFrame } from "@/components/public-frame";
import type { Payment } from "@/lib/types";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pay", robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let p: Payment | null = null;
  let busy = false;
  try {
    p = publicPayment(await headers(), (await params).id);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    busy = e.status === 429;
  }
  return (
    <PublicFrame>
      {p ? <Checkout initial={checkoutView(p)} /> : busy
        ? <Notice title="Too many tries">Wait a minute, then open your payment link again.</Notice>
        : <Notice title="No payment with that ID">Check the address, or go back to the link you were sent.</Notice>}
    </PublicFrame>
  );
}
