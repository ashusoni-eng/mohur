import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Guilloche, Wordmark } from "./brand";
import { AuthForm } from "./auth-form";

export function AuthPage({ mode, title, sub, deleted }: { mode: "login" | "signup"; title: string; sub: string; deleted?: boolean }) {
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
          {deleted && <p role="status" className="mb-6 rounded-[10px] bg-jade-wash px-4 py-3 text-[14px] text-[#125a40]">Your account and all its data have been permanently deleted.</p>}
          <AuthForm mode={mode} />
          <div className="mt-8 flex gap-3 rounded-[12px] border border-line bg-paper p-4 text-[14px] leading-relaxed text-ink-2">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-jade" />
            <p>{mode === "signup" ? "Free to use, for testing and for your own payments. You stay in control: delete your account and everything in it, permanently, at any time from Configuration → Account." : "You can delete your account and everything in it, permanently, at any time from Configuration → Account."} Money always goes straight to your own bank, never through Mohur. For a business, you can also <a className="font-semibold text-emerald underline underline-offset-4" href="https://github.com/ashusoni-eng/mohur#self-host" target="_blank" rel="noreferrer">host your own copy</a>.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
