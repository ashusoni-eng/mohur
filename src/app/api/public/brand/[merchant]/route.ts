import { get } from "@/lib/server/db";
import { logoBytes } from "@/lib/server/brand";
// The URL carries a hash of the image, so a new logo gets a new URL and this can be cached for long.
export async function GET(_r: Request, ctx: { params: Promise<{ merchant: string }> }) {
  const { merchant } = await ctx.params;
  const row = get<{ brand_logo: string | null }>("SELECT brand_logo FROM settings WHERE merchant_id=?", merchant);
  if (!row?.brand_logo) return new Response("Not found", { status: 404 });
  const { type, bytes } = logoBytes(row.brand_logo);
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
  });
}
