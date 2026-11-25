import { describe, expect, it } from "vitest";
import { htmlToText, parseCredit } from "../src/lib/server/mail/parse";

// Wording modelled on common Indian bank alerts, with invented names and numbers.
const credits: [string, string, string, Record<string, unknown>][] = [
  ["HDFC UPI", "View: Account update for your HDFC Bank A/c", "Dear Customer, Rs.500.07 is successfully credited to your account **4321 by VPA ravi.k@okaxis RAVI KUMAR on 25-11-26. Your UPI transaction reference number is 633012345678. Thank you for banking with us.", { amount: 50007, utr: "633012345678", payerVpa: "ravi.k@okaxis", payerName: "RAVI KUMAR", accountTail: "4321" }],
  ["HDFC new style", "❗ You have done a UPI txn. Check details!", "Dear Customer,\n\nRs. 1,499.00 has been credited to your HDFC Bank Account ending in 4321 from VPA meera@ybl (Meera Shah) on 25-11-26.\n\nUPI Reference No.: 633099887766.\n\nAvailable balance: Rs. 82,110.55", { amount: 149900, utr: "633099887766", payerVpa: "meera@ybl", accountTail: "4321" }],
  ["ICICI", "Transaction alert for your ICICI Bank account", "Dear Customer, Your ICICI Bank Account XX321 has been credited with INR 2,50,000.00 on 25-Nov-26. Info: NEFT-AXISN52026112512-ACME TRADERS. The Available Balance in your Account is INR 3,10,220.10.", { amount: 25000000, accountTail: "321" }],
  ["SBI", "Transaction Alert", "Dear Customer, Your A/C XXXXX4321 has a credit by Transfer of Rs 750.00 on 25/11/26 by ASHA. Avl Bal Rs 9,220.00. Amount credited: Rs 750.00", { amount: 75000, accountTail: "4321" }],
  ["Axis", "INR 320.50 was credited to your A/c. no. XX4321.", "25-11-2026\nDear Customer,\nHere's the summary of your Axis Bank Account:\nAmount Credited:\nINR 320.50\nAccount Number:\nXX4321\nDate & Time:\n25-11-26, 10:11:12 IST\nTransaction Info:\nUPI/P2A/633055554444/JOHN D", { amount: 32050, utr: "633055554444", accountTail: "4321" }],
  ["Kotak", "Credit alert", "We wish to inform you that your account xx4321 is credited by Rs. 45.00 on 25-Nov-2026 for UPI transaction. UPI Ref No 633000001111.", { amount: 4500, utr: "633000001111" }],
  ["rupee sign", "Money received", "You received ₹99.00 in your account from priya@oksbi. UTR: 633011112222", { amount: 9900, utr: "633011112222", payerVpa: "priya@oksbi" }],
];

describe("credits", () => {
  it.each(credits)("%s", (_n, subject, body, want) => {
    const r = parseCredit(subject, body);
    expect(r).toMatchObject({ ok: true, credit: want });
  });
  it("reads HTML mail", () => {
    const r = parseCredit("Account update", htmlToText("<style>p{x:1}</style><table><tr><td>Rs.&nbsp;10.01 is credited to your account **4321 by VPA a.b@okicici</td></tr><tr><td>Ref No 633012340000</td></tr></table>"));
    expect(r).toMatchObject({ ok: true, credit: { amount: 1001, utr: "633012340000" } });
  });
  it("finds our payment ID in remarks", () => {
    expect(parseCredit("UPI credit", "Rs.10.00 is credited to your a/c **4321 by VPA a@ybl. Remarks: 7F3A9C21B0")).toMatchObject({ ok: true, credit: { paymentIds: ["7F3A9C21B0"] } });
  });
});

describe("never counts as a payment", () => {
  it.each([
    ["debit", "Rs.500.00 has been debited from account 4321 to VPA shop@ybl on 25-11-26."],
    ["debit that says credited", "Your account XX321 is debited with Rs 500.00 and shop@ybl credited. UPI 633012345678."],
    ["sent", "You have sent Rs 500 to Ravi. It was credited to their account."],
    ["failed", "Your transaction of Rs.500.00 could not be credited and has failed."],
    ["reversal", "Rs.500.00 has been credited to your account **4321 towards reversal of UPI txn."],
    ["refund", "A refund of Rs 500 is credited to your account."],
    ["future", "Rs.500.00 will be credited to your account in 2 days."],
    ["offer", "Get up to Rs.5,00,000 credited instantly."],
    ["collect request", "ravi@okaxis has requested Rs.500.00. Amount will be credited on approval."],
    ["balance only", "Available balance in your account is Rs 12,000.00. Interest credited quarterly."],
    ["remark in a real alert", "Rs.1.00 is credited to your account **4321 by VPA a@ybl. Remarks: Rs.5000.00 is credited to your account."],
    ["remark in the same line", "Rs.1.00 is credited to your account **4321 by VPA a@ybl note Rs.5000.00 paid."],
    ["empty", ""],
  ])("%s", (_n, body) => expect(parseCredit("Account update", body).ok).toBe(false));
});
