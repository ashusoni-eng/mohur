import type { Headers } from "./screen";

/** RFC 2047 encoded words: =?utf-8?B?...?= */
function decodeWords(s: string): string {
  return s
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (whole, cs: string, enc: string, data: string) => {
      const buf = enc.toLowerCase() === "b"
        ? Buffer.from(data, "base64")
        : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
      try { return new TextDecoder(cs.split("*")[0]).decode(buf); } catch { return whole; }
    });
}

/**
 * Every address in a From header. Quoted display names and comments are removed first, so
 * `"alerts@hdfcbank.net" <x@evil.com>` yields only x@evil.com.
 */
export function fromAddresses(value: string): string[] {
  const bare = value.replace(/"(?:\\.|[^"\\])*"/g, " ").replace(/\([^()]*\)/g, " ");
  const out: string[] = [];
  for (const part of bare.split(",")) {
    const angled = [...part.matchAll(/<\s*([^<>\s]+@[^<>\s]+)\s*>/g)].map((m) => m[1]);
    if (angled.length) out.push(...angled);
    else {
      const plain = part.trim();
      if (/^[^\s<>@]+@[^\s<>@]+$/.test(plain)) out.push(plain);
    }
  }
  return out.map((a) => a.toLowerCase().replace(/\.$/, ""));
}

export function buildHeaders(list: { name: string; value: string }[]): { headers: Headers; messageId: string | null } {
  const vals = (n: string) => list.filter((h) => h.name.toLowerCase() === n).map((h) => h.value);
  return {
    headers: {
      from: vals("from").flatMap(fromAddresses),
      subject: decodeWords(vals("subject")[0] ?? "").trim(),
      authResults: vals("authentication-results"),
    },
    messageId: vals("message-id")[0]?.trim() || null,
  };
}

export function parseHeaderBlock(raw: string) {
  const unfolded = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
  const list = unfolded.split("\n").flatMap((l) => {
    const i = l.indexOf(":");
    return i > 0 ? [{ name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }] : [];
  });
  return buildHeaders(list);
}
