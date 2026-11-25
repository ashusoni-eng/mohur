import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  let secret = process.env.APP_SECRET;
  if (!secret) {
    const file = path.join(env.dataDir, "secret.key");
    fs.mkdirSync(env.dataDir, { recursive: true });
    try {
      // "wx" so two processes booting together cannot each write their own key.
      fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    secret = fs.readFileSync(file, "utf8").trim();
  }
  if (secret.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
  cachedKey = Buffer.from(crypto.hkdfSync("sha256", secret, "mohur", "field-encryption", 32));
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(sealed: string): string {
  const raw = Buffer.from(sealed, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const hmac = (key: string, s: string) => crypto.createHmac("sha256", key).update(s).digest("hex");
export const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** Signs short-lived server values such as the OAuth state. */
export const seal = (s: string) => hmac(masterKey().toString("hex"), s);

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scrypt = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => crypto.scrypt(pw.normalize("NFKC"), salt, 64, SCRYPT, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(pw, salt)).toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [salt, key] = stored.split(":");
  const got = await scrypt(pw, Buffer.from(salt, "hex"));
  const want = Buffer.from(key, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Ten hex characters, e.g. 7F3A9C21B0. Short enough to read out over the phone. */
export const newPaymentId = () => crypto.randomBytes(5).toString("hex").toUpperCase();

export function newSlug(len = 10) {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(len), (b) => abc[b % abc.length]).join("");
}
