import type { MetadataRoute } from "next";
import { env } from "@/lib/server/env";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${env.appUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${env.appUrl}/docs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${env.appUrl}/install`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${env.appUrl}/signup`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${env.appUrl}/status`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
