export const MIN_PAISE = 100;
/** NPCI's standard per-transaction ceiling for UPI. */
export const MAX_PAISE = 1_00_000_00;

/** Digits-only parse so "1,499.5" never goes through floating point. */
export function parseRupees(input: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.replace(/[,\s₹]/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function inr(paise: number, opts: { compact?: boolean; paise?: boolean } = {}) {
  const rupees = paise / 100;
  if (opts.compact && rupees >= 100_000)
    return "₹" + new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(rupees);
  const frac = opts.paise ?? paise % 100 !== 0 ? 2 : 0;
  return "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: frac, maximumFractionDigits: frac }).format(rupees);
}

/** Plain decimal for the UPI `am` parameter. */
export const decimal = (paise: number) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
