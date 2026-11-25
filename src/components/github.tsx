import { Star } from "lucide-react";
import { repoStars, repoUrl } from "@/lib/server/github";

export function GithubMark({ size = 19 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

/** Repository link with its live star count. */
export async function GithubStars({ className = "" }: { className?: string }) {
  const stars = await repoStars();
  const shown = stars === null ? null : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(stars);
  return (
    <a
      href={repoUrl} target="_blank" rel="noreferrer"
      aria-label={stars === null ? "Mohur on GitHub" : `Mohur on GitHub, ${stars} star${stars === 1 ? "" : "s"}`}
      className={`inline-flex h-11 items-center gap-2 rounded-[9px] border border-white/20 px-3 text-white/90 transition hover:border-brass-lt hover:text-white ${className}`}
    >
      <GithubMark />
      {shown !== null && <span className="num inline-flex items-center gap-1 text-[14px] font-semibold"><Star size={14} className="fill-brass-lt text-brass-lt" aria-hidden />{shown}</span>}
    </a>
  );
}
