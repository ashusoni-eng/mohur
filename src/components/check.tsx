"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import type { Mail, Payment, PaymentEvent } from "@/lib/types";
import { useApi } from "./live";
import { PaymentDetail } from "./payment-drawer";
import { Button, PageHead, Skeleton } from "./ui";

export function CheckView({ initialId }: { initialId: string }) {
  const first = initialId.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 10);
  const [text, setText] = useState(first);
  const [id, setId] = useState(first);
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHead title="Check status" sub="Enter the payment ID a customer gave you." />
      <form className="mb-6 flex gap-3" onSubmit={(e) => { e.preventDefault(); setId(text.trim().toUpperCase()); }}>
        <input className="field !text-[20px] font-mono uppercase tracking-[0.14em]" aria-label="Payment ID" placeholder="7F3A9C21B0" maxLength={10} autoComplete="off" spellCheck={false} autoFocus value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9a-f]/gi, ""))} />
        <Button type="submit" size="lg" disabled={text.length !== 10}><Search size={17} />Check</Button>
      </form>
      {id && <Result key={id} id={id} />}
    </div>
  );
}

function Result({ id }: { id: string }) {
  const { data, error } = useApi<{ payment: Payment; events: PaymentEvent[]; mail: Mail | null }>(`/api/payments/${encodeURIComponent(id)}`);
  if (error && !data) return <p role="alert" className="card p-6"><b className="block font-display text-[19px] font-normal">{error}</b><span className="text-ink-3">Check the characters. IDs use only 0 to 9 and A to F.</span></p>;
  if (!data) return <Skeleton className="h-80" />;
  return <div className="card rise overflow-hidden"><PaymentDetail {...data} /></div>;
}
