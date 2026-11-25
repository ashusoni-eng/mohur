"use client";
import { useEffect, useId, useRef, useState } from "react";
import { fmtDay, fmtHour } from "@/lib/client";
import { inr } from "@/lib/money";

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, set] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => set(e.contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 100_00;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}
const axis = (paise: number) => {
  const r = paise / 100;
  return r >= 10_000 ? "₹" + new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(r) : inr(Math.round(paise));
};

export function RevenueChart({ series, hourly }: { series: { t: number; amount: number; count: number }[]; hourly: boolean }) {
  const [ref, w] = useWidth();
  const [at, setAt] = useState<number | null>(null);
  const gid = useId();
  const H = 236, L = 58, R = 14, T = 14, B = 28;
  const max = niceMax(Math.max(...series.map((s) => s.amount)));
  const n = series.length;
  const x = (i: number) => L + (n === 1 ? 0.5 : i / (n - 1)) * (w - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s.amount).toFixed(1)}`).join("");
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - L) / 78))));
  const label = hourly ? fmtHour : fmtDay;
  const pick = (cx: number) => {
    const box = ref.current!.getBoundingClientRect();
    setAt(Math.min(n - 1, Math.max(0, Math.round(((cx - box.left - L) / (w - L - R)) * (n - 1)))));
  };
  const s = at === null ? null : series[at];
  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {w > 0 && (
        <svg
          width={w} height={H} tabIndex={0} role="img"
          aria-label={`Amount collected per ${hourly ? "hour" : "day"}. Total ${inr(series.reduce((t, p) => t + p.amount, 0))}. Use arrow keys to read each point.`}
          className="block touch-pan-y rounded-md"
          onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setAt(null)} onBlur={() => setAt(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setAt((a) => Math.min(n - 1, (a ?? -1) + 1));
            else if (e.key === "ArrowLeft") setAt((a) => Math.max(0, (a ?? n) - 1));
            else return;
            e.preventDefault();
          }}
        >
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b7a58" stopOpacity=".2" /><stop offset="1" stopColor="#1b7a58" stopOpacity="0" /></linearGradient></defs>
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={L} x2={w - R} y1={y(max * k)} y2={y(max * k)} stroke={k ? "#e6ebe6" : "#bccac1"} />
              {k % 0.5 === 0 && <text x={L - 10} y={y(max * k) + 4} textAnchor="end" fontSize="12" fill="#63736b" className="num">{axis(max * k)}</text>}
            </g>
          ))}
          {series.map((p, i) => i % every === 0 && <text key={p.t} x={x(i)} y={H - 7} textAnchor={i === 0 ? "start" : x(i) > w - 40 ? "end" : "middle"} fontSize="12" fill="#63736b">{label(p.t)}</text>)}
          <path d={`${line}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z`} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="#1b7a58" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {s && at !== null && (
            <g>
              <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} stroke="#63736b" strokeOpacity=".5" />
              <circle cx={x(at)} cy={y(s.amount)} r="5" fill="#1b7a58" stroke="#fcfdfb" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {s && at !== null && (
        <div className="pointer-events-none absolute top-2 z-10 rounded-[9px] bg-deep px-3 py-2 text-white shadow-lg" style={{ left: Math.min(Math.max(x(at) - 70, 4), Math.max(4, w - 156)) }}>
          <div className="num text-[16px] font-semibold leading-tight">{inr(s.amount)}</div>
          <div className="mt-0.5 whitespace-nowrap text-[13px] text-white/75">{s.count} payment{s.count === 1 ? "" : "s"} · {label(s.t)}</div>
        </div>
      )}
      <table className="sr-only"><caption>Amount collected</caption><tbody>{series.map((p) => <tr key={p.t}><th>{label(p.t)}</th><td>{inr(p.amount)}</td><td>{p.count}</td></tr>)}</tbody></table>
    </div>
  );
}

/** Ranked bars with the value printed beside each, so nothing hides behind hover. */
export function BarList({ rows, color = "#1b7a58", empty }: { rows: { label: React.ReactNode; key: string; value: number; display: string; note?: string; color?: string }[]; color?: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key} className="group" title={r.note}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-ink-2">{r.label}</span>
            <span className="num shrink-0 font-semibold">{r.display}{r.note && <span className="ml-2 font-normal text-ink-3">{r.note}</span>}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-r-[4px] bg-sunk">
            <div className="h-full rounded-r-[4px] transition-[width,filter] duration-500 group-hover:brightness-110" style={{ width: `${r.value ? Math.max(1.5, (r.value / max) * 100) : 0}%`, background: r.color ?? color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
const RAMP = ["#e9eee9", "#c9e2d5", "#93c7ae", "#55a582", "#1b7a58", "#0c4a36"];
export function HeatGrid({ heat }: { heat: number[][] }) {
  const max = Math.max(0, ...heat.flat());
  const [tip, setTip] = useState<{ d: number; h: number } | null>(null);
  return (
    <div>
      <div className="grid grid-cols-[34px_repeat(8,1fr)] gap-[3px]" onPointerLeave={() => setTip(null)}>
        <span />
        {HOURS.map((h) => <span key={h} className="pb-1 text-center text-[12px] text-ink-3">{h}</span>)}
        {heat.map((row, d) => [
          <span key={d} className="self-center text-[12px] text-ink-3">{DAYS[d]}</span>,
          ...row.map((v, h) => (
            <div
              key={`${d}-${h}`} tabIndex={0} aria-label={`${DAYS[d]} from ${HOURS[h]}: ${v} payments`}
              onPointerEnter={() => setTip({ d, h })} onFocus={() => setTip({ d, h })} onBlur={() => setTip(null)}
              className="h-6 rounded-[4px] hover:ring-2 hover:ring-brass-mid" style={{ background: v === 0 ? RAMP[0] : RAMP[Math.max(1, Math.ceil((v / max) * 5))] }}
            />
          )),
        ])}
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px] text-ink-3">
        <span className="num">{tip ? <><b className="text-ink">{heat[tip.d][tip.h]}</b> paid on {DAYS[tip.d]} from {HOURS[tip.h]}</> : "Payments by day and time"}</span>
        <span className="flex items-center gap-1.5">Fewer{RAMP.slice(1).map((c) => <i key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />)}More</span>
      </div>
    </div>
  );
}
