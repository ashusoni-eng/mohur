"use client";
import { useState } from "react";
import { inr } from "@/lib/money";

const STEPS = [10_000, 25_000, 50_000, 100_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 2_500_000, 5_000_000];
export function FeeSlider() {
  const [i, set] = useState(6);
  const m = STEPS[i] * 100;
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div>
        <label htmlFor="vol" className="block text-ink-2">You collect each month</label>
        <output htmlFor="vol" className="num block text-[40px] font-semibold tracking-[-0.02em]">{inr(m)}</output>
        <input id="vol" type="range" min={0} max={STEPS.length - 1} value={i} onChange={(e) => set(Number(e.target.value))} aria-valuetext={inr(m)} className="mt-4 w-full accent-emerald" />
      </div>
      <div className="rounded-[16px] bg-deep p-8 text-white">
        <p className="text-white/80">A 2% gateway takes this every year</p>
        <p className="num mt-1 text-[clamp(38px,6vw,58px)] font-semibold leading-none tracking-[-0.03em] text-brass-lt">{inr(m * 12 * 0.02)}</p>
        <p className="mt-3 text-white/80">With Mohur it stays in your account.</p>
      </div>
    </div>
  );
}
