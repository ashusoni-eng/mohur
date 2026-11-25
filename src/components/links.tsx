"use client";
import { useState } from "react";
import { ExternalLink, Plus, QrCode, Trash2 } from "lucide-react";
import type { LinkRow } from "@/lib/server/views";
import { api, fmtDay, message } from "@/lib/client";
import { inr } from "@/lib/money";
import { qrPath } from "@/lib/qr";
import { useApi } from "./live";
import { DownloadQr, Qr } from "./qr";
import { Button, CopyButton, Dialog, Empty, LinkButton, PageHead, Skeleton, useToast } from "./ui";

type Row = LinkRow & { url: string; state: "open" | "off" | "expired" | "used" };
const STATE = { open: ["Live", "bg-jade-wash text-[#125a40]"], off: ["Paused", "bg-sunk text-ink-3"], expired: ["Expired", "bg-sunk text-ink-3"], used: ["Paid and closed", "bg-lapis-wash text-lapis"] } as const;

export function LinksView() {
  const { data, error, reload } = useApi<{ rows: Row[] }>("/api/links");
  const [show, setShow] = useState<Row | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const toast = useToast();
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); await reload(); } catch (e) { toast(message(e), true); } };
  return (
    <>
      <PageHead title="Payment links"><LinkButton href="/app/create"><Plus size={17} />Create link</LinkButton></PageHead>
      {error && !data && <p className="card p-6 text-carnelian">{error}</p>}
      {!data && !error && <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
      {data?.rows.length === 0 && <div className="card"><Empty title="No links yet" action={<LinkButton href="/app/create">Create a payment link</LinkButton>}>Make a link once and share it in chats, invoices or on your site.</Empty></div>}
      <ul className="grid gap-4 xl:grid-cols-2">
        {data?.rows.map((l) => (
          <li key={l.id} className="card flex min-w-0 flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-[20px]" title={l.title}>{l.title}</h2>
                <p className="num text-ink-3">{l.amount ? inr(l.amount) : l.min_amount ? `From ${inr(l.min_amount)}` : "Any amount"}{l.expires_at ? ` · ${l.state === "expired" ? "expired" : "until"} ${fmtDay(l.expires_at)}` : ""}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${STATE[l.state][1]}`}>{STATE[l.state][0]}</span>
            </div>
            <dl className="num mt-5 grid grid-cols-3 gap-4">
              <div><dt className="text-[13px] text-ink-3">Collected</dt><dd className="text-[19px] font-semibold">{inr(l.paid_amount, { compact: true })}</dd></div>
              <div><dt className="text-[13px] text-ink-3">Paid</dt><dd className="text-[19px] font-semibold">{l.paid_count}<span className="font-normal text-ink-3"> of {l.opened}</span></dd></div>
              <div><dt className="text-[13px] text-ink-3">Views</dt><dd className="text-[19px] font-semibold">{l.views}</dd></div>
            </dl>
            <div className="mt-5 flex items-center justify-between gap-2 rounded-[10px] bg-sunk py-1.5 pl-4 pr-2"><span className="truncate font-mono text-[13px] text-ink-2">{l.url.replace(/^https?:\/\//, "")}</span><CopyButton text={l.url} className="hover:!bg-line" /></div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="quiet" onClick={() => setShow(l)}><QrCode size={15} />QR code</Button>
              <LinkButton size="sm" variant="quiet" href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open</LinkButton>
              {(l.state === "open" || l.state === "off") && <Button size="sm" variant="ghost" onClick={() => act(() => api(`/api/links/${l.id}`, "PATCH", { active: !l.active }), l.active ? "Link paused" : "Link is live again")}>{l.active ? "Pause" : "Resume"}</Button>}
              <Button size="sm" variant="ghost" aria-label={`Delete ${l.title}`} title="Delete" className="ml-auto !px-2.5" onClick={() => setDel(l)}><Trash2 size={16} /></Button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!show} onClose={() => setShow(null)} title={show?.title ?? ""}>
        {show && <div className="flex flex-col items-center gap-5 p-7"><Qr {...qrPath(show.url)} px={264} className="rounded-[12px] border border-line" /><p className="text-center text-ink-3">Opens the payment page, where each customer gets their own UPI QR.</p><DownloadQr {...qrPath(show.url)} name={`mohur-${show.slug}`} caption={[show.title, show.amount ? inr(show.amount) : "Scan to pay"]} /></div>}
      </Dialog>
      <Dialog open={!!del} onClose={() => setDel(null)} title="Delete link">
        {del && <div className="p-6"><p>Anyone who opens <b>{del.title}</b> will see that it no longer exists. Payments already made stay in your records.</p><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={() => { const l = del; setDel(null); void act(() => api(`/api/links/${l.id}`, "DELETE"), "Link deleted"); }}>Delete link</Button></div></div>}
      </Dialog>
    </>
  );
}
