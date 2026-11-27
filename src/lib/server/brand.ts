import { AppError } from "./errors";

const KINDS: [string, (b: Buffer) => boolean][] = [
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
];
export const MAX_LOGO = 200 * 1024;

/**
 * A logo arrives as a data URL. Only raster images whose bytes say what they are: SVG can carry
 * script, and it would be served from Mohur's own origin. Stored as "type;base64".
 */
export function parseLogo(dataUrl: string): string {
  const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new AppError("Upload a PNG, JPEG or WebP image", 400, "invalid_request", "logo");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_LOGO) throw new AppError("Keep the logo under 200 KB", 400, "invalid_request", "logo");
  const kind = KINDS.find(([, is]) => is(bytes))?.[0];
  if (!kind) throw new AppError("Upload a PNG, JPEG or WebP image", 400, "invalid_request", "logo");
  return `${kind};${bytes.toString("base64")}`;
}

export function logoBytes(stored: string) {
  const [type, b64] = stored.split(";");
  return { type, bytes: Buffer.from(b64, "base64") };
}

/** Text on the brand colour must stay readable, so very light colours are refused. */
export function assertReadable(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if ((1.05) / (lum + 0.05) < 3) throw new AppError("That colour is too light for white text on buttons. Pick a darker shade.", 400, "invalid_request", "color");
}
