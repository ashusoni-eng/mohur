import Link from "next/link";
import type { ReactNode } from "react";
import { Guilloche, Mark } from "./brand";

export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-dvh grid-rows-[1fr_auto] overflow-hidden bg-deep">
      <Guilloche density={2} className="pointer-events-none absolute left-1/2 top-1/2 h-[1180px] w-[1180px] -translate-x-1/2 -translate-y-1/2 text-brass-mid/25" />
      <div className="relative grid place-items-center px-4 py-8 sm:py-12">{children}</div>
      <footer className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-6 text-[14px] text-white/70">
        <span className="inline-flex items-center gap-2 text-brass-lt"><Mark size={19} />Powered by Mohur</span>
        <Link href="/status" className="underline-offset-4 hover:text-white hover:underline">Check a payment</Link>
      </footer>
    </main>
  );
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rise w-full max-w-[460px] rounded-[18px] bg-paper p-10 text-center">
      <Mark size={48} className="mx-auto text-brass-mid" />
      <h1 className="mt-5 font-display text-[27px] leading-tight">{title}</h1>
      <p className="mt-2 text-ink-2">{children}</p>
    </div>
  );
}

/** Two-part card: engraved emerald on the left, marble on the right. Stacks on phones. */
export function Folio({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="rise grid w-full max-w-[920px] overflow-hidden rounded-[18px] shadow-[0_30px_80px_-20px_rgb(0_0_0/.55)] md:grid-cols-[1fr_1.15fr]">
      <section className="relative flex flex-col justify-between gap-6 border-b border-brass-mid/40 bg-emerald p-7 text-white md:border-b-0 md:border-r md:p-10">{left}</section>
      <section className="bg-paper p-6 sm:p-10">{right}</section>
    </div>
  );
}
