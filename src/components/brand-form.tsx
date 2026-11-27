"use client";
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { SettingsView } from "@/lib/server/views";
import { api } from "@/lib/client";
import { inr } from "@/lib/money";
import { useSubmit } from "./live";
import { Button, Field, useToast } from "./ui";

const MAX = 200 * 1024;
const SWATCHES = ["#0f3d2e", "#1b2a4a", "#4a1d3f", "#5b2a0e", "#0d4f5c", "#2b2b2b"];

/** Colour and logo shown on this merchant's checkout and payment-link pages. */
export function BrandForm({ s, saved, business }: { s: SettingsView; saved: (s: SettingsView) => void; business: string }) {
  const [color, setColor] = useState(s.brand_color ?? "");
  // undefined: keep what is saved; null: remove; string: a new data URL.
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { busy, errors, submit } = useSubmit();
  const toast = useToast();
  const preview = logo === undefined ? s.brand.logo : logo;
  const pick = (f?: File) => {
    setPickErr(null);
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) return setPickErr("Use a PNG, JPEG or WebP image");
    if (f.size > MAX) return setPickErr("Keep the logo under 200 KB");
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <section className="card p-6 sm:p-8">
      <h2 className="font-display text-[22px] leading-tight">Checkout look</h2>
      <p className="mt-1 max-w-[64ch] text-ink-3">Your colour and logo on the checkout and payment-link pages, so customers know they are paying you.</p>
      <form noValidate className="mt-6 grid gap-7 xl:grid-cols-[1fr_240px]" onSubmit={(e) => { e.preventDefault(); void submit(async () => { const r = await api<SettingsView>("/api/settings/brand", "PUT", { color, ...(logo !== undefined ? { logo } : {}) }); saved(r); setLogo(undefined); toast("Checkout look saved"); }); }}>
        <div className="space-y-6">
          <Field label="Brand colour" optional hint="Dark enough for white text. Leave empty for Mohur emerald." error={errors.color}>
            {(a) => (
              <div className="flex flex-wrap items-center gap-3">
                <input type="color" aria-label="Pick a colour" className="h-11 w-14 cursor-pointer rounded-[9px] border border-line bg-white p-1" value={color || "#0f3d2e"} onChange={(e) => setColor(e.target.value)} />
                <input {...a} className="field w-[130px] font-mono" placeholder="#0f3d2e" maxLength={7} value={color} onChange={(e) => setColor(e.target.value)} />
                <div className="flex gap-1.5">{SWATCHES.map((c) => <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => setColor(c)} className="h-7 w-7 rounded-full ring-offset-2 hover:ring-2 hover:ring-line-strong" style={{ background: c }} />)}</div>
                {color && <Button size="sm" variant="quiet" onClick={() => setColor("")}>Reset</Button>}
              </div>
            )}
          </Field>
          <div>
            <p className="font-semibold">Logo <span className="font-normal text-ink-3">(optional)</span></p>
            <p className="text-[14px] text-ink-3">PNG, JPEG or WebP, up to 200 KB. A wide logo on a transparent background works best.</p>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="ghost" onClick={() => file.current?.click()}><ImagePlus size={16} />{preview ? "Replace logo" : "Upload logo"}</Button>
              {preview && <Button variant="quiet" onClick={() => { setLogo(null); if (file.current) file.current.value = ""; }}><Trash2 size={16} />Remove</Button>}
            </div>
            {(pickErr || errors.logo) && <p role="alert" className="mt-2 text-[14px] text-carnelian">{pickErr || errors.logo}</p>}
          </div>
          {errors.form && <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-carnelian">{errors.form}</p>}
          <Button type="submit" busy={busy}>Save look</Button>
        </div>
        <div aria-hidden className="w-full max-w-[280px] self-start overflow-hidden rounded-[14px] shadow-[0_14px_40px_-18px_rgb(0_0_0/.5)]">
          <div className="space-y-5 bg-emerald p-5 text-white" style={color && /^#[0-9a-f]{6}$/i.test(color) ? { background: color } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            {preview && <img src={preview} alt="" className="max-h-10 max-w-[150px] rounded-[5px] object-contain" />}
            <div><p className="text-[13px] text-white/75">{business}</p><p className="font-display text-[19px]">Order 1042</p></div>
            <p className="num text-[30px] font-semibold leading-none text-brass-lt">{inr(49900)}</p>
          </div>
          <div className="bg-paper p-5"><div className="mx-auto aspect-square w-24 rounded-[8px] bg-sunk" /><p className="mt-3 text-center text-[13px] text-ink-3">Preview</p></div>
        </div>
      </form>
    </section>
  );
}
