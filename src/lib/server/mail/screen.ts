import { BANKS, trustedBank, within } from "../../banks";

/**
 * Stage 1. Decides from headers alone whether a mail is a bank credit alert.
 * Nothing that fails here ever has its body downloaded.
 */

export interface Headers {
  /** Parsed From addresses, lower-cased. More than one is a forgery signal. */
  from: string[];
  subject: string;
  /** Authentication-Results header values, topmost first. */
  authResults: string[];
}

export interface SenderPolicy { bankCode: string; extraDomains: string[]; authServId: string }

export type Screen =
  | { verdict: "read"; bank: string }
  | { verdict: "skip"; reason: string; otherBank?: boolean }
  | { verdict: "suspicious"; reason: string };

// Subjects that are never a credit alert, even from the bank itself.
const NEVER =
  /\b(otp|one[- ]time password|password|passcode|e-?statement|statement|offer|pre-?approved|loan|insurance|kyc|newsletter|log(?:ged)?[- ]?in|reward|voucher|cashback|survey|webinar|credit card|debit card|card (?:ending|no)|beneficiary|payee added|collect request|money request|mandate|autopay|e-?nach|emi|reminder|due|invitation|welcome|feedback)\b/i;

const MAYBE =
  /\b(credit(?:ed)?|received|deposit(?:ed)?|upi|imps|neft|rtgs|transaction|txn|transfer(?:red)?|payment|paid you|account (?:update|alert|activity)|a\/?c|money|fund|insta ?alert|alert)\b/i;

export function subjectLooksLikeCredit(subject: string): boolean {
  const s = subject.normalize("NFKC");
  // "Credit card" is noise, but "credited" is always worth reading.
  if (/\bcredited\b/i.test(s) && !/\b(offer|loan|will be|reward|cashback|voucher)\b/i.test(s)) return true;
  return !NEVER.test(s) && MAYBE.test(s);
}

/**
 * Did the receiving server vouch for this From domain?
 * Only the topmost Authentication-Results from our own server counts: anything lower
 * in the message could have been typed in by the sender.
 */
export function senderAuthenticated(h: Headers, host: string, authServId: string): boolean {
  const top = h.authResults[0];
  if (!top) return false;
  const value = top.replace(/\([^()]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const [serv, ...parts] = value.split(";").map((p) => p.trim());
  if (serv.split(" ")[0] !== authServId) return false;
  for (const p of parts) {
    if (/^dmarc=pass\b/.test(p)) {
      const d = /\bheader\.from=([a-z0-9.-]+)/.exec(p)?.[1];
      if (d && (within(host, d) || within(d, host))) return true;
    }
    if (/^dkim=pass\b/.test(p)) {
      const d = /\bheader\.(?:d|i)=(?:[^\s;]*@)?([a-z0-9.-]+)/.exec(p)?.[1];
      // Signing domain must be the From domain or its parent, and not a bare public suffix.
      if (d && d.includes(".") && d !== "bank.in" && d !== "co.in" && within(host, d)) return true;
    }
  }
  return false;
}

export function screen(h: Headers, policy: SenderPolicy): Screen {
  if (!subjectLooksLikeCredit(h.subject)) return { verdict: "skip", reason: "Subject is not a bank credit alert" };
  if (h.from.length !== 1) {
    const anyBank = h.from.some((f) => trustedBank(f.split("@")[1] ?? "", policy.bankCode, policy.extraDomains));
    return anyBank ? { verdict: "suspicious", reason: "More than one From address" } : { verdict: "skip", reason: "Unrecognised sender" };
  }
  const host = h.from[0].split("@").pop() ?? "";
  const bank = trustedBank(host, policy.bankCode, policy.extraDomains);
  const other = bank ? null : trustedBank(host, "any", []);
  if (other && senderAuthenticated(h, host, policy.authServId))
    return { verdict: "skip", otherBank: true, reason: `From ${other.name}, but Configuration is set to ${BANKS.find((b) => b.code === policy.bankCode)?.name ?? "another bank"}` };
  if (!bank) return { verdict: "skip", reason: `${host} is not one of your bank's sending domains` };
  if (!senderAuthenticated(h, host, policy.authServId))
    return { verdict: "suspicious", reason: "Claims to be your bank but failed DKIM/DMARC checks" };
  return { verdict: "read", bank: bank.name };
}
