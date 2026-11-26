import type { Metadata, Viewport } from "next";
import "@fontsource/marcellus/400.css";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

const DESCRIPTION = "Free, open-source UPI payment gateway. Customers pay your own UPI ID; Mohur confirms each payment from your bank's email or SMS in seconds, with no 2% gateway fee. Payment links, QR codes, dashboard, API and webhooks.";

// Built here but served from another address, so the absolute URLs for share cards are read at request time.
export async function generateMetadata(): Promise<Metadata> {
  const base = new URL(process.env.APP_URL || "http://localhost:4100");
  const title = "Mohur: open-source UPI payment gateway with 0% fees";
  return {
    metadataBase: base,
    title: { default: title, template: "%s · Mohur" },
    description: DESCRIPTION,
    applicationName: "Mohur",
    keywords: ["UPI payment gateway", "open source payment gateway", "zero fee UPI", "UPI QR code", "payment links", "self-hosted payments", "India", "Next.js"],
    openGraph: { type: "website", siteName: "Mohur", title, description: DESCRIPTION, url: "/", locale: "en_IN", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Mohur: UPI payments with 0% gateway fee" }] },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: ["/og.png"] },
  };
}
export const viewport: Viewport = { themeColor: "#06241c", width: "device-width", initialScale: 1 };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
