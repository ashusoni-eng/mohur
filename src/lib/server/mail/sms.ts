import { BANKS } from "../../banks";
import type { Screen } from "./screen";

/**
 * Indian business SMS come from a registered header such as "VM-HDFCBK-S": operator and circle,
 * the header, then S(ervice), T(ransactional), P(romotional) or G(overnment). A normal mobile
 * number can never be a bank, however convincing the text.
 */
export function parseHeader(sender: string): { header: string; kind: string | null } | null {
  const s = sender.trim().toUpperCase();
  const m = /^(?:[A-Z]{2}-)?([A-Z][A-Z0-9]{2,10})(?:-([STPG]))?$/.exec(s);
  return m ? { header: m[1], kind: m[2] ?? null } : null;
}

export const headersFor = (bankCodes: string[], extra: string[]) => [
  ...new Set([...(bankCodes.includes("any") ? BANKS : BANKS.filter((b) => bankCodes.includes(b.code))).flatMap((b) => b.sms), ...extra.map((e) => e.toUpperCase())]),
];

const CREDITISH = /\b(?:credit(?:ed)?|received|deposited)\b/i;
const SECRET = /\b(?:otp|one[- ]time|password|passcode|pin|verification code|cvv)\b/i;
/** "Never share your OTP or PIN" is advice, not a secret. */
const ADVICE = /\b(?:never|do not|don'?t)\s+(?:ever\s+)?share[^.\n]*/gi;

export function screenSms(sender: string, body: string, p: { bankCodes: string[]; extraHeaders: string[] }): Screen {
  if (!CREDITISH.test(body) || SECRET.test(body.replace(ADVICE, " "))) return { verdict: "skip", reason: "Not a credit alert" };
  const h = parseHeader(sender);
  if (!h) return { verdict: "suspicious", reason: "Reads like a bank credit, but came from an ordinary number" };
  if (h.kind === "P") return { verdict: "skip", reason: "Promotional message" };
  if (!headersFor(p.bankCodes, p.extraHeaders).includes(h.header)) return { verdict: "skip", reason: `${h.header} is not one of your bank's SMS senders` };
  const bank = BANKS.find((b) => b.sms.includes(h.header)) ?? (p.bankCodes.length === 1 ? BANKS.find((b) => b.code === p.bankCodes[0]) : undefined);
  return { verdict: "read", bank: bank?.name ?? h.header, code: bank?.code ?? null };
}
