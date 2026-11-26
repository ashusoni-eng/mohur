import type { MetadataRoute } from "next";
import { env } from "@/lib/server/env";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  // Payment pages and the dashboard are private to the people using them.
  return { rules: { userAgent: "*", allow: ["/", "/install", "/status"], disallow: ["/app", "/api", "/checkout", "/pay"] }, sitemap: `${env.appUrl}/sitemap.xml` };
}
