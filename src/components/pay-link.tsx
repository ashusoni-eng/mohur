"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { inr } from "@/lib/money";
import { Folio } from "./public-frame";
import { useSubmit } from "./live";
import { Button, Field } from "./ui";

export function PayLink({ link: l }: { link: { slug: string; title: string; description: string; amount: number | null; min: number | null; askName: boolean; askContact: boolean; business: string } }) {
  const router = useRouter();
  const [f, set] = useState({ amount: "", name: "", contact: "" });
  const [gone, setGone] = useState(false);
  const { busy, errors, submit } = useSubmit();
  return (
    <Folio
      left={
        <>
          <div>
            <p className="text-white/75">{l.business}</p>
            <h1 className="mt-2 break-words font-display text-[30px] leading-[1.15]">{l.title}</h1>
            {l.description && <p className="mt-3 whitespace-pre-line break-words text-white/80">{l.description}</p>}
          </div>
          {l.amount && <p className="num text-[46px] font-semibold leading-none tracking-[-0.025em] text-brass-lt">{inr(l.amount)}</p>}
        </>
      }
      right={
        <form
          noValidate className="flex h-full min-h-[260px] flex-col justify-center gap-5"
          onSubmit={(e) => { e.preventDefault(); void submit(async () => { const r = await api<{ id: string }>(`/api/public/links/${l.slug}`, "POST", f); setGone(true); router.push(`/checkout/${r.id}`); }); }}
        >
          {!l.amount && (
            <Field label="Amount" hint={l.min ? `At least ${inr(l.min)}` : undefined} error={errors.amount}>
              {(a) => <div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[26px] text-ink-3">₹</span><input {...a} autoFocus className="field num !py-3 !pl-11 !text-[30px] font-semibold" inputMode="decimal" autoComplete="off" placeholder="0" value={f.amount} onChange={(e) => set({ ...f, amount: e.target.value })} /></div>}
            </Field>
          )}
          {l.askName && <Field label="Your name">{(a) => <input {...a} className="field" autoComplete="name" maxLength={80} value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} />}</Field>}
          {l.askContact && <Field label="Phone or email">{(a) => <input {...a} className="field" autoComplete="tel" maxLength={80} value={f.contact} onChange={(e) => set({ ...f, contact: e.target.value })} />}</Field>}
          {!l.askName && !l.askContact && l.amount && <div><h2 className="font-display text-[24px]">Pay with any UPI app</h2><p className="mt-1 text-ink-3">You will get a QR code to scan with Google Pay, PhonePe, Paytm, BHIM or your bank's app.</p></div>}
          {errors.form && <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-[14px] text-carnelian">{errors.form}</p>}
          <Button type="submit" size="lg" variant="gold" busy={busy || gone} className="w-full">{l.amount ? `Pay ${inr(l.amount)}` : "Continue to pay"}</Button>
        </form>
      }
    />
  );
}
