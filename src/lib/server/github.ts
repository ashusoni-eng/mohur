const REPO = process.env.GITHUB_REPO || "ashusoni-eng/mohur";
export const repoUrl = `https://github.com/${REPO}`;

/** Star count, refreshed at most every ten minutes. Null when GitHub cannot be reached, and the page shows just the icon. */
export async function repoStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "mohur-site" },
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const n = ((await res.json()) as { stargazers_count?: unknown }).stargazers_count;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}
