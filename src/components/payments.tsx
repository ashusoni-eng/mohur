"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import type { Payment } from "@/lib/types";
import { inr } from "@/lib/money";
import { fmtTime } from "@/lib/client";
import { useApi } from "./live";
import { PaymentDrawer } from "./payment-drawer";
import { Button, Empty, LinkButton, PageHead, Segmented, Skeleton, StatusPill } from "./ui";

const TABS = [["all", "All"], ["on_hold", "On hold"], ["open", "In progress"], ["paid", "Paid"], ["declined", "Declined"], ["expired", "Expired"]].map(([value, label]) => ({ value, label }));
const SRC = { link: "Link", qr: "QR", api: "API" };

export function PaymentsView({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(text); setPage(1); }, 250); return () => clearTimeout(t); }, [text]);
  const qs = new URLSearchParams({ status, q });
  const { data, error } = useApi<{ rows: Payment[]; total: number; paid: number; size: number }>(`/api/payments?${qs}&page=${page}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const filtered = status !== "all" || !!q;

  return (
    <>
      <PageHead title="Payments" sub={data && <span className="num">{data.total} payment{data.total === 1 ? "" : "s"}, {inr(data.paid)} collected</span>}>
        <LinkButton variant="quiet" href={`/api/payments/export?${qs}`} download><Download size={16} />Export CSV</LinkButton>
      </PageHead>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={TABS} />
        <label className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !pl-10" type="search" aria-label="Search payments" placeholder="Payment ID, customer, UPI ID or UTR" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      <div className="card overflow-hidden">
        {error && !data && <p className="p-6 text-carnelian">{error}</p>}
        {!data && !error && <div className="space-y-2 p-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {data && data.rows.length === 0 && (filtered
          ? <Empty title="No matching payments">Try another status or search.</Empty>
          : <Empty title="No payments yet" action={<LinkButton href="/app/create">Create your first payment</LinkButton>}>Every QR and link payment will be listed here.</Empty>)}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-line text-[13px] text-ink-3"><tr>{["Payment", "Customer", "Status", "Source", "Created", "Amount"].map((h) => <th key={h} scope="col" className={`whitespace-nowrap px-5 py-3 font-medium ${h === "Amount" ? "text-right max-sm:hidden" : ""} ${h === "Status" ? "max-sm:text-right" : ""} ${h === "Source" ? "max-xl:hidden" : ""} ${h === "Created" ? "max-md:hidden" : ""} ${h === "Customer" ? "max-lg:hidden" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((p) => (
                  <tr key={p.id} onClick={() => setOpenId(p.id)} className="cursor-pointer hover:bg-sunk/70">
                    <td className="max-w-[260px] px-5 max-sm:max-w-[170px] py-3"><button type="button" className="block w-full text-left"><span className="block truncate font-semibold">{p.title}</span><span className="font-mono text-[13px] text-ink-3">{p.id}</span></button></td>
                    <td className="max-w-[220px] px-5 py-3 max-lg:hidden"><span className="block truncate">{p.payer_name || p.customer_name || <span className="text-ink-3">Not known yet</span>}</span><span className="block truncate text-[13px] text-ink-3">{p.payer_vpa || p.customer_contact}</span></td>
                    <td className="px-5 py-3 max-sm:pl-0 max-sm:text-right"><span className="num mb-1 block text-[16px] font-semibold sm:hidden">{inr(p.payable)}</span><StatusPill status={p.status} /></td>
                    <td className="px-5 py-3 text-ink-2 max-xl:hidden">{SRC[p.source]}</td>
                    <td className="num whitespace-nowrap px-5 py-3 text-ink-2 max-md:hidden">{fmtTime(p.created_at)}</td>
                    <td className="num whitespace-nowrap px-5 py-3 text-right text-[16px] font-semibold max-sm:hidden">{inr(p.payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 text-ink-3">
          <span className="num">Page {page} of {pages}</span>
          <Button size="sm" variant="quiet" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></Button>
          <Button size="sm" variant="quiet" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></Button>
        </div>
      )}
      <PaymentDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
