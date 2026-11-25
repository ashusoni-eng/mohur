/**
 * Stage 2. Reads the body of a mail that passed screening and extracts the credit.
 * The rule throughout: when the wording is not plainly "money arrived in your account",
 * return null and leave it to a human. A missed credit is an inconvenience, a false one is a loss.
 */

export interface Credit {
  amount: number; utr: string | null; payerVpa: string | null; payerName: string | null;
  accountTail: string | null; paymentIds: string[]; sentence: string;
}
export type Parsed = { ok: true; credit: Credit } | { ok: false; reason: string };

const MONEY = /(?:rs\.?|inr|₹)\s*[.:]?\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d.]*\d)/gi;
const CREDIT = /\b(?:credited|received|deposited|added to your|has been credit|is credit|credit of|credit for|credit alert|paid you|sent you)\b/i;
const DEBIT = /\b(?:debited|spent|withdrawn|withdrawal|purchase|you (?:have )?(?:sent|paid|transferred)|deducted|transferred from your|paid to|sent to)\b/i;
const NOT_FINAL =
  /\b(?:will be|would be|can be|could be|may be|shall be|to be credited|yet to be|not (?:been )?credited|get|earn|win|up ?to|eligible|offer|pre-?approved|fail(?:ed|ure)|declined|rejected|revers(?:ed|al)|refund(?:ed)?|cancel(?:led)?|pending|processing|on hold|request(?:ed)?|if (?:you|the|it)|cashback|reward|loan|limit|interest)\b/i;
/** SBI's UPI alerts leave the currency out: "credited by 500.00". */
const BARE = /\b(?:credited|debited) (?:by|with|for) (\d[\d,]*\.\d{1,2})(?![\d.,]*\d)(?![a-z\/-])/gi;
const BALANCE_BEFORE = /(?:bal(?:ance)?|limit|available|avl\.?|avbl\.?|charges?|fee|gst|min(?:imum)?|total)\b[^₹.;]{0,30}$/i;

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h\d|\/table)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function normalise(text: string) {
  return text.normalize("NFKC").replace(/[​-‏­⁠﻿]/g, "").replace(/[ \t ]+/g, " ").replace(/\r/g, "");
}

/** Split into sentences without breaking "Rs. 500.00", "A/c no. 1234" or "Mr. Rao". */
function sentences(text: string): string[] {
  return text
    .replace(/\n{2,}/g, " ¶ ").replace(/\n/g, " ").replace(/ +/g, " ")
    .split(/¶|(?<=[a-z0-9)]{2,}[.!?])\s+(?=[A-Z₹])/)
    .flatMap((s) => {
      // Rejoin nothing, but undo a split directly after an abbreviation.
      return [s.trim()];
    })
    .reduce<string[]>((acc, s) => {
      const prev = acc[acc.length - 1];
      if (prev && /\b(?:rs|no|mr|mrs|ms|dr|ref|a\/c|acct|avl|bal)\.$/i.test(prev)) acc[acc.length - 1] = `${prev} ${s}`;
      else if (s) acc.push(s);
      return acc;
    }, []);
}

const toPaise = (s: string) => {
  const [r, p = ""] = s.replace(/,/g, "").split(".");
  return Number(r) * 100 + Number(p.padEnd(2, "0") || 0);
};

function amountsIn(s: string, sms = false): number[] {
  const out: number[] = [];
  if (sms) for (const m of s.matchAll(BARE)) out.push(toPaise(m[1]));
  for (const m of s.matchAll(MONEY)) {
    if (BALANCE_BEFORE.test(s.slice(0, m.index))) continue;
    const v = toPaise(m[1]);
    if (v > 0 && Number.isSafeInteger(v)) out.push(v);
  }
  return [...new Set(out)].filter((v) => v > 0);
}

export function parseCredit(subject: string, body: string, opts: { sms?: boolean } = {}): Parsed {
  const subj = normalise(subject);
  let text = normalise(body).slice(0, 20_000);
  // "Received!" on its own line is the verb for the amount below it.
  if (opts.sms) text = text.replace(/^\s*(received|credit alert|credited)\s*[!:]\s*/i, "$1 ");
  const all = [...sentences(text)];
  // Some banks say everything in the subject line.
  if (amountsIn(subj).length && CREDIT.test(subj)) all.unshift(subj);

  const hits: { s: string; amount: number }[] = [];
  let sawDebit = false;
  let sawSoft = false;
  for (const s of all) {
    const amounts = amountsIn(s, opts.sms);
    if (!amounts.length) continue;
    const isCredit = CREDIT.test(s);
    if (DEBIT.test(s)) { sawDebit = true; continue; }
    if (!isCredit) continue;
    if (NOT_FINAL.test(s)) { sawSoft = true; continue; }
    if (amounts.length > 1) return { ok: false, reason: "More than one amount in the credit line" };
    hits.push({ s, amount: amounts[0] });
  }

  // Tabular alerts: "Amount Credited: INR 500.00", or a credit sentence with the amount on its own row.
  if (!hits.length && !sawDebit && !sawSoft) {
    const flat = text.replace(/\s+/g, " ");
    const creditLine = all.find((s) => CREDIT.test(s) && !DEBIT.test(s) && !NOT_FINAL.test(s));
    const row = /\b(?:transaction |txn |credit(?:ed)? )?amount(?: credited| received)?(?: \((?:in )?(?:rs\.?|inr|₹)\))?\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*\.\d{2})(?!\d)/i.exec(flat);
    if (creditLine && row && !DEBIT.test(flat)) hits.push({ s: creditLine, amount: toPaise(row[1]) });
  }

  if (!hits.length)
    return { ok: false, reason: sawDebit ? "This is a debit alert" : sawSoft ? "Not a completed credit (pending, refund, offer or failed)" : "No credited amount found" };
  if (sawDebit) return { ok: false, reason: "Mentions both a credit and a debit" };
  if (new Set(hits.map((h) => h.amount)).size > 1) return { ok: false, reason: "Several different credited amounts" };

  const flat = `${subj} ${text}`.replace(/\s+/g, " ");
  const { s, amount } = hits[0];
  return {
    ok: true,
    credit: { amount, utr: findUtr(flat), payerVpa: findVpa(s) ?? findVpa(flat), payerName: findName(s), accountTail: findTail(s) ?? findTail(flat), paymentIds: findIds(flat), sentence: s.slice(0, 400) },
  };
}

function findUtr(t: string): string | null {
  const pats = [
    /\b(?:utr|rrn)(?:\s*(?:no\.?|number|ref(?:erence)?(?: no\.?)?))?\s*(?:is|:|-|\.)*\s*([a-z]{0,6}\d{10,20})\b/i,
    /\b(?:upi|imps|neft|rtgs)?\s*(?:transaction|txn|trxn)?\.?\s*ref(?:erence)?\.?\s*(?:no\.?|number|id|#)?\s*(?:is|:|-|\.)*\s*([a-z]{0,6}\d{10,20})\b/i,
    /\b(?:upi|imps)[\/:\- ]+(?:p2[apm][\/\-])?(?:cr[\/\-])?(\d{12})\b/i,
    /\b(?:neft|rtgs)[\/:\- ]+(?:cr[\/\-])?([a-z]{4}[a-z0-9]{8,18})\b/i,
  ];
  for (const p of pats) {
    const m = p.exec(t);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

const MAIL_TLD = /\.(?:com|net|org|in|co|bank|info|io)$/i;
function findVpa(t: string): string | null {
  for (const m of t.matchAll(/\b([a-z0-9][a-z0-9.\-_]{1,255}@[a-z][a-z0-9.]{1,63})\b/gi)) {
    // A VPA handle has no dot (okaxis, ybl, upi). Anything with a TLD is an email address.
    const v = m[1].replace(/\.$/, "");
    if (!MAIL_TLD.test(v) && !v.split("@")[1].includes(".")) return v.toLowerCase();
  }
  return null;
}

function findName(s: string): string | null {
  const pats = [
    /\b(?:by|from)\s+(?:[Vv][Pp][Aa]|UPI ID|upi id)?\s*[a-z0-9.\-_]+@[a-z0-9]+\s*[,(]?\s*([A-Z][A-Za-z .&']{2,48}?)\s*(?:\)|,|\bon\b|\bvia\b|\(|\.|$)/,
    /\b(?:by|from|sender:?)\s+(?:(?:mr|mrs|ms|m\/s)\.?\s+)?([A-Z][A-Za-z.&']*(?: [A-Z][A-Za-z.&']*){0,5})\s*(?:,|\bon\b|\bvia\b|\(|\.|$|\bvpa\b|\bthrough\b|\busing\b)/,
  ];
  for (const p of pats) {
    const n = p.exec(s)?.[1]?.trim().replace(/\s+/g, " ");
    if (n && !/^(?:vpa|upi|imps|neft|rtgs|your|account|a\/c)\b/i.test(n)) return n;
  }
  return null;
}

function findTail(t: string): string | null {
  const m = /\b(?:a\/?c|acct|account)\b\.?\s*(?:no\.?|number|ending(?: (?:with|in))?)?\s*[:\-]?\s*(?:is\s*)?(?:[x*.•]+[\s\-]?)*\s*(\d{3,18})\b/i.exec(t);
  return m ? m[1].slice(-4) : null;
}

/** Our own payment IDs, if the bank passes the UPI note through. */
function findIds(t: string): string[] {
  return [...new Set([...t.matchAll(/(?<![0-9a-z])([0-9a-f]{10})(?![0-9a-z])/gi)].map((m) => m[1].toUpperCase()))];
}
