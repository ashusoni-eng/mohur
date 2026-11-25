"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BellRing, CodeXml, Landmark, LayoutDashboard, Link2, LogOut, Menu, QrCode, ReceiptIndianRupee, ScanSearch, X } from "lucide-react";
import { api } from "@/lib/client";
import { Guilloche, Wordmark } from "./brand";
import { useLive } from "./live";

const NAV = [
  { href: "/app", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/app/create", label: "Create payment", Icon: QrCode },
  { href: "/app/payments", label: "Payments", Icon: ReceiptIndianRupee, badge: "hold" as const },
  { href: "/app/links", label: "Payment links", Icon: Link2 },
  { href: "/app/mail", label: "Bank alerts", Icon: BellRing, badge: "strays" as const },
  { href: "/app/check", label: "Check status", Icon: ScanSearch },
  { href: "/app/configuration", label: "Configuration", Icon: Landmark },
  { href: "/app/developers", label: "Developers", Icon: CodeXml },
];

export function Shell({ name, business, children }: { name: string; business: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const live = useLive();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const mail = live?.mail;
  const phones = (live?.devices ?? []).filter((d) => d.status === "active");
  const phoneOk = phones.some((d) => d.sms_ok && d.last_seen_at && Date.now() - d.last_seen_at < 45 * 60_000);
  const dot = !mail ? (phoneOk ? "bg-[#5fd3a2]" : phones.length ? "bg-[#f0c25d]" : "bg-white/35") : mail.status === "live" ? "bg-[#5fd3a2]" : mail.status === "error" ? "bg-[#f0816d]" : "bg-[#f0c25d] breathe";
  const label = !mail ? (phoneOk ? "Listening for bank SMS" : phones.length ? "Phone has gone quiet" : "Gmail not connected") : mail.status === "live" ? (phoneOk ? "Listening to mail and SMS" : "Listening for bank mail") : mail.status === "error" ? "Gmail needs attention" : mail.status === "retrying" ? "Reconnecting to Gmail" : "Connecting to Gmail";

  return (
    <div className="min-h-dvh lg:pl-[256px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <div className="no-print sticky top-0 z-30 flex h-16 items-center justify-between bg-deep px-5 text-brass-lt lg:hidden">
        <Link href="/app"><Wordmark size={30} /></Link>
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-11 w-11 place-items-center rounded-lg text-white">{open ? <X /> : <Menu />}</button>
      </div>
      <nav aria-label="Main" className={`no-print fixed inset-y-0 left-0 z-20 flex w-[256px] flex-col overflow-y-auto overflow-x-hidden bg-deep text-white transition-transform max-lg:top-16 lg:translate-x-0 ${open ? "translate-x-0" : "max-lg:invisible -translate-x-full"}`}>
        <Guilloche still className="pointer-events-none absolute -bottom-[190px] -left-[150px] h-[460px] w-[460px] text-brass-mid/25" />
        <Link href="/app" className="relative hidden px-6 pb-8 pt-7 text-brass-lt lg:block"><Wordmark size={36} /></Link>
        <ul className="relative flex-1 space-y-0.5 px-3 max-lg:pt-4">
          {NAV.map(({ href, label, Icon, badge }) => {
            const on = href === "/app" ? path === href : path.startsWith(href);
            const n = badge ? live?.[badge] ?? 0 : 0;
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined} className={`flex h-11 items-center gap-3 rounded-[9px] px-3.5 transition ${on ? "bg-white/10 font-semibold text-brass-lt" : "text-white/75 hover:bg-white/5 hover:text-white"}`}>
                  <Icon size={18} strokeWidth={1.8} />
                  <span className="flex-1">{label}</span>
                  {n > 0 && <span className="num shine min-w-6 rounded-full px-1.5 text-center text-[13px] font-bold leading-6 text-deep">{n > 99 ? "99+" : n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="relative space-y-3 p-4">
          <Link href="/app/configuration" className="flex items-center gap-2.5 rounded-[9px] bg-white/[.07] px-3.5 py-3 text-[14px] text-white/85 backdrop-blur-sm hover:bg-white/[.12]">
            <i className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{label}
          </Link>
          <div className="flex items-center justify-between gap-2 pl-1">
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">{business}</div>
              <div className="truncate text-[13px] text-white/65">{name}</div>
            </div>
            <button type="button" aria-label="Sign out" title="Sign out" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white" onClick={async () => { await api("/api/auth/logout", "POST"); router.push("/login"); router.refresh(); }}><LogOut size={17} /></button>
          </div>
        </div>
      </nav>
      {open && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 top-16 z-10 bg-deep/40 lg:hidden" onClick={() => setOpen(false)} />}
      <main id="main" className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
