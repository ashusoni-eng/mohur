"use client";
import { useEffect, useState } from "react";
import { BatteryWarning, Check, Download, MessageSquareText, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { app } from "@/lib/app-release";
import { BANKS } from "@/lib/banks";
import type { DeviceRow } from "@/lib/server/views";
import { api, ago, message } from "@/lib/client";
import { qrPath } from "@/lib/qr";
import { useLive } from "./live";
import { Qr } from "./qr";
import { Button, CopyButton, Dialog, LinkButton, useToast } from "./ui";

interface Pairing { id: string; until: number; server: string; link: string }
const Box = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => <section className="card p-6 sm:p-8"><h2 className="font-display text-[22px] leading-tight">{title}</h2>{sub && <p className="mt-1 max-w-[64ch] text-ink-3">{sub}</p>}<div className="mt-6">{children}</div></section>;

export function PhonePanel({ bank }: { bank: string }) {
  const devices = (useLive()?.devices ?? []).filter((d) => d.status === "active");
  const [pair, setPair] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<DeviceRow | null>(null);
  const toast = useToast();
  const paired = pair && devices.find((d) => d.id === pair.id);
  const headers = bank === "any" ? null : BANKS.find((b) => b.code === bank)?.sms;

  useEffect(() => { if (paired) { toast(`${paired.model || "Phone"} is paired`); setPair(null); } }, [paired, toast]);

  const start = async () => {
    setBusy(true);
    try { setPair(await api<Pairing>("/api/devices", "POST", { label: devices.length ? `Phone ${devices.length + 1}` : "Phone" })); } catch (e) { toast(message(e), true); }
    setBusy(false);
  };

  return (
    <>
      {devices.length > 0 && (
        <Box title="Paired phones">
          <ul className="divide-y divide-line">
            {devices.map((d) => {
              const quiet = !d.last_seen_at || Date.now() - d.last_seen_at > 45 * 60_000;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 first:pt-0 last:pb-0">
                  <span className={`grid h-11 w-11 place-items-center rounded-full ${quiet || !d.sms_ok ? "bg-amber-wash text-amber" : "bg-jade-wash text-jade"}`}><Smartphone size={20} /></span>
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <p className="truncate font-semibold">{d.model || d.label}</p>
                    <p className="num text-[14px] text-ink-3">{d.last_seen_at ? `Seen ${ago(d.last_seen_at)}` : "Not seen yet"} · {d.received} bank SMS{d.last_sms_at ? ` · last ${ago(d.last_sms_at)}` : ""}</p>
                    {!d.sms_ok && <p className="mt-1 flex items-center gap-1.5 text-[14px] text-carnelian"><TriangleAlert size={15} />SMS permission is off. Open Mohur on the phone to allow it.</p>}
                    {!!d.sms_ok && !d.battery_ok && <p className="mt-1 flex items-center gap-1.5 text-[14px] text-amber"><BatteryWarning size={15} />Battery saving may delay it. Open Mohur on the phone to fix this.</p>}
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setDel(d)}>Remove</Button>
                </li>
              );
            })}
          </ul>
        </Box>
      )}

      <Box title={devices.length ? "Pair another phone" : "Confirm payments from bank SMS"} sub="Install Mohur on the Android phone whose number is registered with your bank. It forwards bank credit SMS the moment they arrive. Gmail keeps working alongside, and the same credit is never counted twice.">
        <ol className="space-y-6">
          <li className="flex gap-4"><Num n={1} /><div className="min-w-0 flex-1"><p className="font-semibold">Install the app</p><p className="mt-0.5 text-ink-2">Android 8 or newer. iPhones do not let apps read SMS.</p><LinkButton variant="quiet" href={app.href} download={app.file} className="mt-3"><Download size={16} />Download mohur.apk</LinkButton><p className="mt-3 max-w-[60ch] text-[14px] text-ink-3">Google Play Protect often blocks downloaded apps that read SMS. If it does, <a className="font-semibold text-emerald underline underline-offset-4" href="https://github.com/ashusoni-eng/mohur#phone-app-bank-sms" target="_blank" rel="noreferrer">install it by USB</a> instead.</p></div></li>
          <li className="flex gap-4"><Num n={2} /><div className="min-w-0 flex-1"><p className="font-semibold">Pair it</p><p className="mt-0.5 text-ink-2">Open the app, tap Scan pairing code, and scan the code shown here.</p>
            {!pair && <Button className="mt-3" busy={busy} onClick={start}>Show pairing code</Button>}
            {pair && <PairCode p={pair} again={start} />}
          </div></li>
          <li className="flex gap-4"><Num n={3} /><div><p className="font-semibold">Allow SMS</p><p className="mt-0.5 text-ink-2">The app asks for SMS permission, then starts listening.</p></div></li>
        </ol>
      </Box>

      <Box title="What leaves the phone">
        <ul className="space-y-3 text-ink-2">
          <li className="flex gap-3"><Check size={19} className="mt-0.5 shrink-0 text-jade" /><span>Only credit messages from {headers ? <b className="font-mono text-ink">{headers.join(", ")}</b> : "banks Mohur knows"}, and only to this server.</span></li>
          <li className="flex gap-3"><Check size={19} className="mt-0.5 shrink-0 text-jade" /><span>OTPs, passwords and personal messages are dropped on the phone itself.</span></li>
          <li className="flex gap-3"><MessageSquareText size={19} className="mt-0.5 shrink-0 text-lapis" /><span>A message from an ordinary mobile number never counts, whatever it says, and stays on the phone.</span></li>
          <li className="flex gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-jade" /><span>Every message is signed with a key held in the phone&apos;s secure keystore. Removing the phone here cancels it.</span></li>
        </ul>
      </Box>

      <Dialog open={!!del} onClose={() => setDel(null)} title="Remove phone">
        {del && <div className="p-6"><p>{del.model || del.label} will stop confirming payments. Alerts already received stay in your records.</p><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={async () => { const d = del; setDel(null); try { await api(`/api/devices/${d.id}`, "DELETE"); toast("Phone removed"); } catch (e) { toast(message(e), true); } }}>Remove phone</Button></div></div>}
      </Dialog>
    </>
  );
}

const Num = ({ n }: { n: number }) => <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brass-mid text-[14px] font-semibold text-brass">{n}</span>;

function PairCode({ p, again }: { p: Pairing; again: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.ceil((p.until - now) / 1000);
  const local = /\/\/(localhost|127\.)/.test(p.server);
  const plain = p.server.startsWith("http:");
  if (left <= 0) return <div className="mt-4"><p className="text-ink-2">This code has expired.</p><Button className="mt-3" onClick={again}>Show a new code</Button></div>;
  return (
    <div className="rise mt-4 flex flex-wrap items-center gap-6">
      <div className="rounded-[14px] border border-line bg-white p-3"><Qr {...qrPath(p.link)} px={232} /></div>
      <div className="min-w-0 max-w-[320px] flex-1 basis-[220px] space-y-3 text-[14px] text-ink-2">
        <p className="num">Code closes in <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b>. Anyone who scans it can send alerts as you, so keep it off shared screens.</p>
        <p>The phone will connect to <span className="break-all font-mono text-ink">{p.server}</span></p>
        {local && <p className="text-carnelian">A phone cannot reach this address. Set APP_URL to this server&apos;s public address.</p>}
        {!local && plain && <p className="text-amber">This works only while the phone is on the same Wi-Fi, and the connection is not encrypted. Use an https address when you go live.</p>}
        <div className="flex flex-wrap items-center gap-2"><a href={p.link} className="font-semibold text-emerald underline underline-offset-4">Open in app</a><CopyButton text={p.link} label="Copy code" /></div>
      </div>
    </div>
  );
}
