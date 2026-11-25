import Link from "next/link";
import { Download } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { GithubStars } from "@/components/github";
import { CopyButton, LinkButton } from "@/components/ui";
import { app } from "@/lib/app-release";
import { env } from "@/lib/server/env";
import { repoUrl } from "@/lib/server/github";

export const dynamic = "force-dynamic";
export const metadata = { title: "Install the Android app", description: "Install Mohur on Android and allow it to read bank SMS." };

function Cmd({ children }: { children: string }) {
  return <div className="relative mt-3 overflow-hidden rounded-[11px] bg-deep"><CopyButton text={children} className="absolute right-2 top-2 bg-deep !text-white/75 hover:!bg-white/10" /><pre className="whitespace-pre-wrap break-words p-4 pr-24 font-mono text-[13px] leading-relaxed text-[#d5e6dc]"><code>{children}</code></pre></div>;
}
function Steps({ items }: { items: React.ReactNode[] }) {
  return <ol className="mt-5 space-y-4">{items.map((t, i) => <li key={i} className="flex gap-4"><span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brass-mid text-[14px] font-semibold text-brass">{i + 1}</span><div className="min-w-0 flex-1 text-ink-2">{t}</div></li>)}</ol>;
}
const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-ink">{children}</b>;

export default function Install() {
  const local = `${env.appUrl}${app.href}`;
  return (
    <>
      <header className="bg-deep text-white">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-6"><Link href="/" className="text-brass-lt"><Wordmark size={36} /></Link><GithubStars /></div>
        <div className="mx-auto max-w-[860px] px-6 pb-14 pt-6">
          <h1 className="font-display text-[clamp(34px,5vw,52px)] leading-tight">Install Mohur on Android</h1>
          <p className="mt-3 max-w-[56ch] text-[17px] text-white/85">Android guards SMS closely, because scam apps ask for it too. These steps unlock it for Mohur only.</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3"><LinkButton href={app.href} download={app.file} variant="gold" size="lg"><Download size={18} />Download version {app.version}</LinkButton><span className="text-[14px] text-white/75">{app.size} · Android 8 or newer</span></div>
        </div>
      </header>
      <main className="mx-auto max-w-[860px] space-y-6 px-6 py-12">
        <section className="card p-6 sm:p-8">
          <h2 className="font-display text-[25px]">SMS permission is greyed out</h2>
          <p className="mt-1 text-ink-3">Already installed? Start here. You do not need to reinstall.</p>
          <Steps items={[
            <>Open Mohur and tap <B>Allow</B> once. If Android says the app was denied, or that this is a restricted setting, close that message. The unlock option often appears only after this.</>,
            <>Open the phone&rsquo;s <B>Settings → Apps → Mohur</B>. (Or press and hold the Mohur icon and tap <B>App info</B>.)</>,
            <>Tap the <B>⋮</B> menu, usually at the top right, and choose <B>Allow restricted settings</B>. Confirm with your PIN or fingerprint.</>,
            <>On the same screen, open <B>Permissions → SMS</B> and choose <B>Allow</B>.</>,
            <>Return to Mohur. It should say <B>Listening</B>. Tap <B>Fix</B> if it mentions battery saving.</>,
          ]} />
          <p className="mt-6 rounded-[10px] bg-sunk px-5 py-4 text-[14px] text-ink-2">No ⋮ menu? Some phones, Xiaomi and Redmi among them, hide it. Tap the greyed SMS permission once and look again. If it still is not there, use the computer method below.</p>
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="font-display text-[25px]">Install from a computer</h2>
          <p className="mt-1 max-w-[64ch] text-ink-3">The most reliable way. Play Protect&rsquo;s block on downloaded SMS apps is aimed at browsers, chat apps and file managers, and SMS can be allowed from the same place.</p>
          <Steps items={[
            <>On the phone, open <B>Settings → About phone</B> and tap <B>Build number</B> seven times. Then turn on <B>Developer options → USB debugging</B>. On Xiaomi, also turn on <B>USB debugging (Security settings)</B> and <B>Install via USB</B>.</>,
            <>On the computer, install <a className="font-semibold text-emerald underline underline-offset-4" href="https://developer.android.com/tools/releases/platform-tools" target="_blank" rel="noreferrer">Android platform tools</a>, connect the phone and accept the prompt on it.</>,
            <>Download and install the app:<Cmd>{`curl -LO ${local} && adb install -r mohur.apk`}</Cmd></>,
            <>Allow SMS:<Cmd>{"adb shell pm grant in.mohur.app android.permission.RECEIVE_SMS && adb shell pm grant in.mohur.app android.permission.READ_SMS"}</Cmd></>,
            <>If that is refused, lift the restriction first and run step 4 again:<Cmd>{"adb shell appops set in.mohur.app ACCESS_RESTRICTED_SETTINGS allow"}</Cmd></>,
            <>Turn <B>USB debugging</B> off again.</>,
          ]} />
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="font-display text-[25px]">Play Protect blocked the install</h2>
          <p className="mt-3 text-ink-2">Use the computer method above if you can. If you paused Play Protect to install, <B>turn it back on</B> straight after: Play Store → your picture → Play Protect → settings. It protects the rest of your phone, and Mohur does not need it off. If it later offers to remove Mohur, choose to keep it.</p>
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="font-display text-[25px]">Check that it is genuine</h2>
          <p className="mt-3 text-ink-2">Every release is signed with the same key, so Android refuses an update from anyone else. The code is <a className="font-semibold text-emerald underline underline-offset-4" href={repoUrl} target="_blank" rel="noreferrer">open on GitHub</a>, and you can build it yourself.</p>
          <dl className="mt-5 space-y-4">
            {([["SHA-256 of this file", app.sha256], ["SHA-256 of the signing certificate", app.signer]] as const).map(([k, v]) => <div key={k}><dt className="text-[14px] text-ink-3">{k}</dt><dd className="mt-1 flex items-start justify-between gap-3"><span className="min-w-0 break-all font-mono text-[13px]">{v}</span><CopyButton text={v} className="-mt-1" /></dd></div>)}
          </dl>
        </section>
      </main>
    </>
  );
}
