import { z } from "zod";
import { BANKS, bankByIfsc } from "./banks";
import { MAX_PAISE, MIN_PAISE, parseRupees } from "./money";

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const req = (label: string, max = 120) => z.string({ error: `Enter ${label}` }).trim().min(1, `Enter ${label}`).max(max, `Keep this under ${max} characters`);
export const rupees = z.string({ error: "Enter an amount" }).transform((s, ctx) => {
  const p = parseRupees(s);
  if (p === null) { ctx.addIssue({ code: "custom", message: "Enter an amount like 499 or 499.50" }); return z.NEVER; }
  if (p < MIN_PAISE || p > MAX_PAISE) { ctx.addIssue({ code: "custom", message: "Amount must be between ₹1 and ₹1,00,000" }); return z.NEVER; }
  return p;
});
const httpUrl = z.string().trim().max(500).refine((s) => { try { return ["https:", "http:"].includes(new URL(s).protocol); } catch { return false; } }, "Enter a full URL starting with https://");
/** Empty, or valid. A plain union would lose the inner error message. */
const orEmpty = <T extends z.ZodType>(inner: T) =>
  z.string().transform((s, ctx): z.infer<T> | "" => {
    if (!s.trim()) return "";
    const r = inner.safeParse(s);
    if (r.success) return r.data;
    ctx.addIssue({ code: "custom", message: r.error.issues[0].message });
    return z.NEVER;
  });
const optionalUrl = orEmpty(httpUrl).optional();
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
const password = z.string().min(10, "Use at least 10 characters").max(200, "Use at most 200 characters");

export const signUp = z.object({ name: req("your name", 80), business: req("your business name", 80), email, password });
export const signIn = z.object({ email, password: z.string().min(1, "Enter your password").max(200) });
export const newQr = z.object({ amount: rupees, title: text(100).optional(), customer: text(80).optional() });
export const newLink = z.object({
  title: req("a title", 100), description: text(500).default(""), openAmount: z.boolean().default(false), amount: orEmpty(rupees).optional(), minAmount: orEmpty(rupees).optional(),
  reusable: z.boolean().default(true), askName: z.boolean().default(false), askContact: z.boolean().default(false), redirectUrl: optionalUrl,
  expiresInHours: z.number().int().min(0).max(24 * 365).default(0),
}).refine((l) => l.openAmount || l.amount, { path: ["amount"], error: "Enter an amount, or let the customer enter it" });
export const openLink = z.object({ amount: z.string().max(20).optional(), name: text(80).optional(), contact: text(80).optional() });
export const note = z.object({ note: text(200).default("") });
export const utr = z.object({ utr: z.string().max(40) });

export const bank = z.object({
  upi_id: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9.\-_]{1,254}@[a-z][a-z0-9]{1,63}$/, "Enter a UPI ID like name@okhdfcbank"),
  payee_name: req("the name customers will see", 60), account_holder: text(100).default(""),
  account_number: orEmpty(z.string().trim().regex(/^\d{6,18}$/, "Account number should be 6 to 18 digits")).optional(),
  ifsc: orEmpty(z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks like HDFC0001234")).default(""),
  bank_name: text(80).default(""), branch_name: text(80).default(""), bank_code: text(20).default("any"),
}).superRefine((b, ctx) => {
  // The account behind the UPI ID, its IFSC and the bank whose alerts are trusted are one and the same bank.
  const of = b.ifsc ? bankByIfsc(b.ifsc) : undefined;
  const chosen = BANKS.find((x) => x.code === b.bank_code);
  if (of && chosen && of.code !== chosen.code) ctx.addIssue({ code: "custom", path: ["ifsc"], message: `This IFSC is ${of.name}, but the bank chosen is ${chosen.name}. Use the account your UPI ID pays into.` });
});
export const extraHeaders = text(200).default("").transform((s, ctx) => {
  const list = s.toUpperCase().split(/[\s,]+/).filter(Boolean);
  for (const h of list) if (!/^[A-Z][A-Z0-9]{2,10}$/.test(h)) { ctx.addIssue({ code: "custom", message: `${h} is not an SMS sender like HDFCBK. Leave out the operator prefix and -S.` }); return z.NEVER; }
  return [...new Set(list)].join(", ");
});
export const rules = z.object({
  verify_seconds: z.number().int().min(15, "Use at least 15 seconds").max(600), qr_minutes: z.number().int().min(1).max(60), hold_minutes: z.number().int().min(5, "Use at least 5 minutes").max(1440),
  timer_start: z.enum(["claim", "qr"]), amount_mode: z.enum(["off", "smart", "strict"]), show_bank: z.boolean(), extra_headers: extraHeaders, support_contact: text(120).default(""),
  extra_domains: text(500).default("").transform((s, ctx) => {
    const list = s.toLowerCase().split(/[\s,]+/).filter(Boolean);
    for (const d of list) {
      // Trusting a public mailbox provider would let anyone write their own receipt.
      if (/^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|proton(mail)?|rediffmail|zoho)\./.test(d)) { ctx.addIssue({ code: "custom", message: `${d} is open to anyone, so it cannot be trusted as a bank` }); return z.NEVER; }
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || ["co.in", "bank.in", "net.in", "org.in", "com.in"].includes(d)) { ctx.addIssue({ code: "custom", message: `${d} is not a specific domain` }); return z.NEVER; }
    }
    return list.join(", ");
  }),
});
export const newDevice = z.object({ label: text(40).default("") });
export const deviceHello = z.object({ model: text(80).default(""), version: text(20).default(""), sms_ok: z.boolean(), battery_ok: z.boolean() });
export const deviceSms = z.object({ items: z.array(z.object({ id: z.string().regex(/^[0-9a-f]{64}$/), sender: z.string().max(40), body: z.string().max(2000), age_ms: z.number().int().min(0).max(7 * 86_400_000) })).min(1).max(20) });

export const imap = z.object({ email, password: z.string().transform((s) => s.replace(/\s/g, "")).pipe(z.string().min(8, "Enter the 16-letter app password").max(100)) });
export const lab = z.object({ channel: z.enum(["email", "sms"]).default("email"), from: text(200), subject: text(300), body: z.string().max(20000), authenticated: z.boolean().default(true), inject: z.boolean().default(false) });
export const webhook = z.object({ url: httpUrl });
export const apiKey = z.object({ label: req("a label", 60) });
export const passwordChange = z.object({ current: z.string().min(1, "Enter your current password").max(200), next: password });
export const profile = z.object({ name: req("your name", 80), business: req("your business name", 80) });

const paise = z.number({ error: "amount is required, in paise" }).int("amount must be whole paise").min(MIN_PAISE, "amount must be at least 100 paise").max(MAX_PAISE, "amount must be at most 10000000 paise");
export const apiPayment = z.object({ amount: paise, title: text(100).optional(), reference: text(100).optional(), customer: z.object({ name: text(80).optional(), contact: text(80).optional() }).optional(), redirect_url: httpUrl.optional() });
export const apiLink = z.object({ title: req("title", 100), description: text(500).optional(), amount: paise.optional(), reusable: z.boolean().optional(), redirect_url: httpUrl.optional(), expires_at: z.iso.datetime({ offset: true }).optional() });
