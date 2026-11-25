import Link from "next/link";
import { Guilloche, Wordmark } from "./brand";
import { AuthForm } from "./auth-form";

export function AuthPage({ mode, title, sub }: { mode: "login" | "signup"; title: string; sub: string }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Guilloche density={2} className="pointer-events-none absolute left-1/2 top-1/2 h-[920px] w-[920px] -translate-x-1/2 -translate-y-1/2 text-brass-mid/35" />
        <Link href="/" className="relative text-brass-lt"><Wordmark size={40} /></Link>
        <p className="relative max-w-[15ch] font-display text-[46px] leading-[1.12] text-white">Every rupee you earn, kept whole.</p>
      </aside>
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-[430px]">
          <Link href="/" className="mb-10 inline-block text-emerald lg:hidden"><Wordmark /></Link>
          <h1 className="font-display text-[34px] leading-tight">{title}</h1>
          <p className="mb-8 mt-1.5 text-ink-3">{sub}</p>
          <AuthForm mode={mode} />
        </div>
      </section>
    </main>
  );
}
