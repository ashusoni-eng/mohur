"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ban, Check, CircleDashed, Clock, Copy as CopyIcon, Hourglass, LoaderCircle, ScanLine, X } from "lucide-react";
import type { PaymentStatus } from "@/lib/types";

type Variant = "primary" | "gold" | "quiet" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-emerald text-white hover:bg-emerald-2 disabled:bg-ink-3",
  gold: "shine text-deep hover:brightness-105 disabled:opacity-60",
  quiet: "bg-white border border-line-strong text-ink hover:border-emerald disabled:opacity-60",
  ghost: "text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60",
  danger: "bg-white border border-carnelian/40 text-carnelian hover:bg-carnelian-wash disabled:opacity-60",
};
const BTN = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[9px] font-semibold transition";
const SIZE = { sm: "h-9 px-3.5 text-[14px]", md: "h-11 px-5", lg: "h-[52px] px-7 text-[16px]" };
export function LinkButton({ variant = "primary", size = "md", className = "", ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: keyof typeof SIZE }) {
  const cls = `${BTN} ${SIZE[size]} ${VARIANT[variant]} ${className}`;
  return p.href.startsWith("/api") || p.href.startsWith("/download") || p.target || p.download !== undefined ? <a {...p} className={cls} /> : <Link {...p} className={cls} />;
}
export function Button({ variant = "primary", size = "md", busy, children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; busy?: boolean }) {
  return (
    <button type="button" {...p} disabled={p.disabled || busy} className={`${BTN} ${SIZE[size]} ${VARIANT[variant]} ${className}`}>
      {busy && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, optional }: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; children: (a: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px] font-semibold">
        {label}
        {optional && <span className="text-[13px] font-normal text-ink-3">Optional</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error || hint ? id + "d" : undefined })}
      {(error || hint) && <p id={id + "d"} className={`mt-1.5 text-[13px] leading-snug ${error ? "text-carnelian" : "text-ink-3"}`}>{error || hint}</p>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <div id={id} className="text-[14px] font-semibold">{label}</div>
        {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} onClick={() => onChange(!checked)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-jade" : "bg-line-strong"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-[10px] bg-sunk p-1">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={`h-8 whitespace-nowrap rounded-[7px] px-3.5 text-[14px] font-semibold transition ${o.value === value ? "bg-paper text-ink shadow-[0_1px_2px_rgb(6_36_28/.14)]" : "text-ink-3 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS: Record<PaymentStatus, { label: string; cls: string; Icon: typeof Check }> = {
  paid: { label: "Paid", cls: "bg-jade-wash text-[#125a40]", Icon: Check },
  on_hold: { label: "On hold", cls: "bg-amber-wash text-amber", Icon: Hourglass },
  pending: { label: "Awaiting", cls: "bg-lapis-wash text-lapis", Icon: ScanLine },
  verifying: { label: "Verifying", cls: "bg-lapis-wash text-lapis", Icon: CircleDashed },
  declined: { label: "Declined", cls: "bg-carnelian-wash text-carnelian", Icon: Ban },
  expired: { label: "Expired", cls: "bg-sunk text-ink-3", Icon: Clock },
};
export function StatusPill({ status }: { status: PaymentStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${s.cls}`}>
      <s.Icon size={13} strokeWidth={2.4} aria-hidden className={status === "verifying" ? "animate-spin [animation-duration:3s]" : ""} />
      {s.label}
    </span>
  );
}

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : `${label} ${text}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { return; }
        setDone(true);
        clearTimeout(t.current);
        t.current = setTimeout(() => setDone(false), 1600);
      }}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-semibold transition ${done ? "text-jade" : "text-ink-3 hover:bg-sunk hover:text-ink"} ${className}`}
    >
      {done ? <Check size={14} /> : <CopyIcon size={14} />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <svg viewBox="-24 -24 48 48" width="44" height="44" className="mb-4 text-line-strong" fill="none" stroke="currentColor" aria-hidden><circle r="20" strokeWidth="3" strokeDasharray="1.5 1.119" /><circle r="13" strokeWidth="1" /></svg>
      <p className="font-display text-[19px]">{title}</p>
      {children && <p className="mt-1 max-w-[44ch] text-ink-3">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Native dialog: focus trap, Escape and inert background come for free. */
export function Dialog({ open, onClose, title, children, side = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
      className={`bg-paper text-ink backdrop:bg-deep/50 backdrop:backdrop-blur-[2px] ${side ? "slide-in m-0 ml-auto h-dvh max-h-none w-full max-w-[460px]" : "rise m-auto w-[calc(100%-32px)] max-w-[460px] rounded-[16px]"}`}
    >
      {open && (
        <div className={side ? "flex min-h-full flex-col" : ""}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper px-6 py-4">
            <h2 className="font-display text-[19px]">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-9 w-9 place-items-center rounded-lg text-ink-3 hover:bg-sunk hover:text-ink"><X size={18} /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, set] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Math.random();
    set((l) => [...l.slice(-2), { id, text, bad }]);
    setTimeout(() => set((l) => l.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-5 z-50 flex flex-col items-center gap-2">
        {list.map((t) => (
          <div key={t.id} className={`rise flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg ${t.bad ? "bg-carnelian" : "bg-deep"}`}>
            {t.bad ? <X size={16} /> : <Check size={16} className="text-brass-lt" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`breathe rounded-[10px] bg-sunk ${className}`} aria-hidden />;
}

export function PageHead({ title, children, sub }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div>
        <h1 className="font-display text-[32px] leading-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-[62ch] text-ink-3">{sub}</p>}
      </div>
      {children && <div className="flex max-w-full flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}
