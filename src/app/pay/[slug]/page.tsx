import { brandOf } from "@/lib/server/views";
import type { Metadata } from "next";
import { get, run } from "@/lib/server/db";
import { linkState } from "@/lib/server/payments";
import type { Link } from "@/lib/types";
import { inr } from "@/lib/money";
import { PayLink } from "@/components/pay-link";
import { PublicFrame, Notice } from "@/components/public-frame";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };
const find = (slug: string) => get<Link & { business: string; contact: string }>("SELECT l.*, m.business, s.support_contact contact FROM links l JOIN merchants m ON m.id=l.merchant_id JOIN settings s ON s.merchant_id=m.id WHERE l.slug=?", slug);

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const l = find((await params).slug);
  return l ? { title: `${l.title} · ${l.business}`, description: l.amount ? `Pay ${inr(l.amount)} to ${l.business} by UPI` : `Pay ${l.business} by UPI`, robots: { index: false } } : { title: "Link not found", robots: { index: false } };
}

export default async function Page({ params }: P) {
  const l = find((await params).slug);
  if (!l) return <PublicFrame><Notice title="This link does not exist">Check that you copied the whole address, or ask for a new link.</Notice></PublicFrame>;
  const state = linkState(l);
  if (state !== "open")
    return <PublicFrame><Notice title={state === "used" ? "This has already been paid" : state === "expired" ? "This link has expired" : "This link is paused"}>{state === "used" ? "It accepted a single payment." : `Ask ${l.business} for a new link.`}{l.contact && <> You can reach them at {l.contact}.</>}</Notice></PublicFrame>;
  run("UPDATE links SET views=views+1 WHERE id=?", l.id);
  return <PublicFrame><PayLink link={{ slug: l.slug, title: l.title, description: l.description, amount: l.amount, min: l.min_amount, askName: !!l.ask_name, askContact: !!l.ask_contact, business: l.business, brand: brandOf(l.merchant_id) }} /></PublicFrame>;
}
