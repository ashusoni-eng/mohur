import type { Metadata, Viewport } from "next";
import "@fontsource/marcellus/400.css";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mohur: UPI payments without the fee", template: "%s · Mohur" },
  description: "Collect UPI payments into your own bank account. Mohur confirms each one from your bank's email alert, so there is no gateway fee.",
};
export const viewport: Viewport = { themeColor: "#06241c", width: "device-width", initialScale: 1 };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
