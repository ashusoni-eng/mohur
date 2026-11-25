import Link from "next/link";
import { ArrowRight, Check, Download, Smartphone } from "lucide-react";
import { Guilloche, Mark, Reeding, Wordmark } from "@/components/brand";
import { FeeSlider } from "@/components/fee-slider";
import { GithubMark, GithubStars } from "@/components/github";
import { LinkButton } from "@/components/ui";
import { currentMerchant } from "@/lib/server/auth";
import { repoUrl } from "@/lib/server/github";
import { app } from "@/lib/app-release";

export default async function Home() {
  const m = await currentMerchant();
  const go = m ? { href: "/app", label: "Open dashboard" } : { href: "/signup", label: "Create account" };
  return (
    <>
      <div className="relative overflow-hidden bg-deep text-white">
        <Guilloche density={2} className="pointer-events-none absolute -right-[300px] -top-[170px] h-[1060px] w-[1060px] text-brass-mid/35 max-md:-right-[480px] max-md:text-brass-mid/20" />
        <header className="relative mx-auto flex max-w-[1180px] items-center justify-between px-6 py-6">
          <Link href="/" className="text-brass-lt"><Wordmark size={38} /></Link>
          <nav className="flex items-center gap-2 sm:gap-5">
            <Link href="#app" className="text-white/80 hover:text-white max-md:hidden">Get the app</Link>
            <Link href="/status" className="text-white/80 hover:text-white max-md:hidden">Check a payment</Link>
            {!m && <Link href="/login" className="px-2 text-white/80 hover:text-white">Sign in</Link>}
            <GithubStars />
            <LinkButton href={go.href} variant="gold" className="max-sm:hidden">{go.label}</LinkButton>
          </nav>
        </header>
        <section className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-6 pb-24 pt-14 lg:grid-cols-[1.35fr_1fr] lg:pb-32 lg:pt-20">
          <div>
            <h1 className="font-display text-[clamp(42px,5.6vw,70px)] leading-[1.08]">Take UPI payments. <br className="max-lg:hidden" />Keep every rupee.</h1>
            <p className="mt-6 max-w-[50ch] text-[18px] leading-relaxed text-white/85">Customers scan and pay your own UPI ID. Mohur reads your bank&rsquo;s email or SMS alert and confirms the payment in seconds, so there is no 2% to give away.</p>
            <div className="mt-9 flex flex-wrap gap-4">
              <LinkButton href={go.href} variant="gold" size="lg">{go.label}<ArrowRight size={18} /></LinkButton>
              <a href={app.href} download={app.file} className="inline-flex h-[52px] items-center gap-2 rounded-[9px] border border-white/25 px-6 font-semibold text-white transition hover:border-brass-lt"><Download size={18} />Download for Android</a>
            </div>
          </div>
          <div className="relative mx-auto grid aspect-square w-full max-w-[380px] place-items-center" aria-hidden>
            <Reeding lit={60} tone="#c79f52" />
            <div className="shine relative grid h-[86%] w-[86%] place-items-center overflow-hidden rounded-full text-deep shadow-[inset_0_0_0_8px_rgb(255_255_255/.22),0_30px_60px_-20px_rgb(0_0_0/.6)]">
              <Guilloche className="absolute inset-0 text-[#7a5a1c]/45" />
              <Mark size={148} className="relative text-[#5f4512]" />
            </div>
          </div>
        </section>
      </div>

      <main>
        <section className="mx-auto max-w-[1180px] px-6 py-20 lg:py-28">
          <h2 className="max-w-[20ch] font-display text-[clamp(30px,4vw,44px)] leading-tight">Your bank already tells you. Mohur listens.</h2>
          <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <figure className="card p-7">
              <figcaption className="text-[14px] text-ink-3">An alert lands in your Gmail</figcaption>
              <p className="mt-4 font-semibold">View: Account update for your Bank A/c</p>
              <p className="mt-3 text-[17px] leading-[1.75] text-ink-2">Dear Customer, <mark className="rounded bg-brass-wash px-1 text-ink">Rs.1,499.00</mark> is successfully <mark className="rounded bg-jade-wash px-1 text-ink">credited</mark> to your account <mark className="rounded bg-brass-wash px-1 text-ink">**4321</mark> by VPA <mark className="rounded bg-brass-wash px-1 text-ink">meera@okaxis</mark>. Your UPI reference number is <mark className="rounded bg-brass-wash px-1 text-ink">633012345678</mark>.</p>
            </figure>
            <div className="grid place-items-center text-brass-mid"><ArrowRight size={34} className="max-lg:rotate-90" /></div>
            <figure className="card flex flex-col p-7">
              <figcaption className="text-[14px] text-ink-3">The customer sees this</figcaption>
              <div className="flex flex-1 items-center gap-6 pt-4">
                <span className="shine grid h-24 w-24 shrink-0 place-items-center rounded-full text-deep"><Check size={46} strokeWidth={1.8} /></span>
                <div><p className="font-display text-[28px] leading-tight">Payment received</p><p className="num mt-1 text-ink-2">₹1,499 · UTR 633012345678</p></div>
              </div>
            </figure>
          </div>
        </section>

        <section className="border-y border-line bg-paper">
          <div className="mx-auto grid max-w-[1180px] gap-x-16 gap-y-12 px-6 py-20 md:grid-cols-2 lg:py-24">
            {[
              ["Links and QR codes", "Share a payment link for a fixed price or any amount, or show a QR at the counter. Each customer gets a code of their own."],
              ["Forgery does not pay", "Mail counts only if Gmail verifies it came from your bank, and SMS only from your bank’s registered sender. A fake receipt is set aside."],
              ["On hold, never lost", "If the alert is late, the customer gets a payment ID and the search goes on. They can add their UTR, and you can approve or decline."],
              ["Built to plug in", "A small REST API, signed webhooks and live status, so your site knows the moment money arrives."],
            ].map(([t, d]) => <div key={t}><h3 className="font-display text-[24px]">{t}</h3><p className="mt-2 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">{d}</p></div>)}
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-6 py-20 lg:py-28">
          <h2 className="mb-12 max-w-[22ch] font-display text-[clamp(30px,4vw,44px)] leading-tight">What the fee really costs</h2>
          <FeeSlider />
        </section>

        <section id="app" className="scroll-mt-6 border-t border-line bg-paper">
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 py-20 md:grid-cols-[1fr_auto] lg:py-24">
            <div>
              <h2 className="max-w-[22ch] font-display text-[clamp(30px,4vw,44px)] leading-tight">No email from your bank? Use its SMS.</h2>
              <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-ink-2">Put Mohur on the Android phone your bank texts. Credit messages confirm payments the moment they arrive, even with the app closed. OTPs and personal messages never leave the phone.</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <LinkButton href={app.href} download={app.file} size="lg"><Download size={18} />Download for Android</LinkButton>
                <span className="num text-[14px] text-ink-3">Version {app.version} · {app.size} · Android 8 or newer</span>
              </div>
              <p className="mt-4 max-w-[62ch] text-[14px] text-ink-3">Play Protect often blocks downloaded apps that read SMS. If it does, <a className="font-semibold text-emerald underline underline-offset-4" href={`${repoUrl}#phone-app-bank-sms`} target="_blank" rel="noreferrer">install it by USB</a>.</p>
            </div>
            <div className="relative mx-auto grid h-[380px] w-[200px] place-items-center overflow-hidden rounded-[34px] border-[7px] border-ink bg-deep shadow-[0_30px_60px_-24px_rgb(6_36_28/.55)]" aria-hidden>
              <Guilloche still className="absolute -left-[100px] top-0 h-[400px] w-[400px] text-brass-mid/30" />
              <div className="relative grid place-items-center text-center text-white">
                <div className="relative grid h-[128px] w-[128px] place-items-center"><Reeding lit={60} tone="#c79f52" /><span className="shine grid h-[82%] w-[82%] place-items-center rounded-full text-[#5f4512]"><Mark size={50} /></span></div>
                <p className="mt-5 font-display text-[24px]">Listening</p>
                <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-paper px-3.5 py-1.5 text-[13px] font-semibold text-jade"><Smartphone size={14} />₹1,499 confirmed</p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-emerald text-white">
          <Guilloche still className="pointer-events-none absolute -left-40 top-1/2 h-[620px] w-[620px] -translate-y-1/2 text-brass-mid/30" />
          <div className="relative mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-8 px-6 py-16">
            <div><h2 className="font-display text-[clamp(28px,3.6vw,40px)] leading-tight">You need three things.</h2><p className="mt-2 max-w-[58ch] text-white/85">A UPI ID, a bank that alerts you when money arrives, and a Gmail address or Android phone that gets the alert.</p></div>
            <LinkButton href={go.href} variant="gold" size="lg">{go.label}<ArrowRight size={18} /></LinkButton>
          </div>
        </section>
      </main>
      <footer className="bg-deep py-8 text-white/70"><div className="mx-auto flex max-w-[1180px] px-6 flex-wrap items-center justify-between gap-4"><span className="text-brass-lt"><Wordmark size={28} /></span><span className="text-[14px]">A mohur was the gold coin of the Mughal mints.</span><nav className="flex items-center gap-6 text-[14px]"><a href={app.href} download={app.file} className="hover:text-white">Android app</a><Link href="/status" className="hover:text-white">Check a payment</Link><a href={repoUrl} target="_blank" rel="noreferrer" aria-label="Mohur on GitHub" className="hover:text-white"><GithubMark size={22} /></a></nav></div></footer>
    </>
  );
}
