/** The Mohur mark: a milled coin edge around the eight-fold star of Mughal jali work. */
export function Mark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} className={className} aria-hidden fill="none" stroke="currentColor">
      <circle r="21" strokeWidth="3.4" strokeDasharray="1.5 1.249" />
      <circle r="17.2" strokeWidth="1" />
      <g strokeWidth="1.6" strokeLinejoin="round">
        <path d="M-8.6-8.6h17.2v17.2h-17.2z" />
        <path d="M-8.6-8.6h17.2v17.2h-17.2z" transform="rotate(45)" />
      </g>
      <circle r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Wordmark({ className = "", size = 34 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Mark size={size} />
      <span className="font-display leading-none tracking-[0.04em]" style={{ fontSize: size * 0.7 }}>Mohur</span>
    </span>
  );
}

const f = (n: number) => n.toFixed(1);
/** One closed engraved line: a circle whose radius is modulated by two sine waves. */
function rosette(r: number, a: number, k: number, b: number, j: number, phase: number) {
  const steps = Math.max(240, k * 14);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = r + a * Math.sin(k * t + phase) + b * Math.cos(j * t);
    d += `${i ? "L" : "M"}${f(rr * Math.cos(t))} ${f(rr * Math.sin(t))}`;
  }
  return d + "Z";
}

/** Banknote-style guilloche. Every band is several phase-shifted copies of one line. */
export function Guilloche({ className = "", still = false, density = 1 }: { className?: string; still?: boolean; density?: 1 | 2 }) {
  const band = (r: number, a: number, k: number, b: number, j: number, n: number) =>
    Array.from({ length: n }, (_, i) => rosette(r, a, k, b, j, (i / n) * Math.PI * 2)).join("");
  const n = density === 2 ? 8 : 5;
  return (
    <svg viewBox="-300 -300 600 600" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="0.6">
      <g className={still ? "" : "turn"}>
        <path d={band(262, 22, 24, 0, 1, n)} />
        <path d={band(116, 26, 12, 5, 24, n)} />
      </g>
      <g className={still ? "" : "turn-rev"}>
        <path d={band(190, 34, 16, 6, 8, n)} />
        <path d={band(56, 18, 8, 0, 1, n)} />
      </g>
    </svg>
  );
}

/** Sixty reeds around a coin. `lit` of them are bright: one per second on the verification clock. */
export function Reeding({ lit = 60, size = 360, tone = "#1b7a58", off = "#d9e0da" }: { lit?: number; size?: number; tone?: string; off?: string }) {
  return (
    <svg viewBox="-180 -180 360 360" width={size} height={size} className="absolute inset-0 h-full w-full" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => (
        <rect key={i} x="-2" y="-177" width="4" height="15" rx="2" fill={i < lit ? tone : off} transform={`rotate(${i * 6})`} style={{ transition: "fill .5s" }} />
      ))}
    </svg>
  );
}
