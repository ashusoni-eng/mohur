import { get, run } from "./db";
import { newSlug } from "./crypto";
import { AppError } from "./payments";
import { env } from "./env";
import type { Link } from "../types";

export interface NewLink { title: string; description?: string; amount?: number | null; minAmount?: number | null; reusable?: boolean; askName?: boolean; askContact?: boolean; redirectUrl?: string | null; expiresAt?: number | null }

export function createLink(merchantId: string, n: NewLink): Link {
  if (!get("SELECT 1 FROM settings WHERE merchant_id=? AND upi_id IS NOT NULL AND upi_id!=''", merchantId))
    throw new AppError("Add your UPI ID in Configuration before creating a link", 409, "not_configured");
  const id = "lnk_" + newSlug(14);
  run(
    `INSERT INTO links (id, merchant_id, slug, title, description, amount, min_amount, reusable, ask_name, ask_contact, redirect_url, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, merchantId, newSlug(10), n.title, n.description ?? "", n.amount ?? null, n.minAmount ?? null, n.reusable === false ? 0 : 1, n.askName ? 1 : 0, n.askContact ? 1 : 0,
    n.redirectUrl || null, n.expiresAt ?? null, Date.now(),
  );
  return get<Link>("SELECT * FROM links WHERE id=?", id)!;
}
export const linkUrl = (l: { slug: string }) => `${env.appUrl}/pay/${l.slug}`;
export function ownedLink(merchantId: string, id: string): Link {
  const l = get<Link>("SELECT * FROM links WHERE id=? AND merchant_id=?", id, merchantId);
  if (!l) throw new AppError("No link with that ID", 404, "not_found");
  return l;
}
