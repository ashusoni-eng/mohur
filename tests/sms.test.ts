import { describe, expect, it } from "vitest";
import { parseCredit } from "../src/lib/server/mail/parse";
import { parseHeader, screenSms } from "../src/lib/server/mail/sms";

// Wording modelled on common Indian bank SMS, with invented names and numbers.
const ok: [string, string, Record<string, unknown>][] = [
  ["HDFC", "Credit Alert!\nRs.500.07 credited to HDFC Bank A/c XX4321 on 25-11-26 from VPA ravi.k@okaxis (UPI 633012345678)", { amount: 50007, utr: "633012345678", payerVpa: "ravi.k@okaxis", accountTail: "4321" }],
  ["HDFC received", "Received!\nRs.1,200.00 in HDFC Bank A/c XX4321\nFrom RAVI KUMAR\nOn 25/11/26\nRef 633012345678", { amount: 120000, utr: "633012345678", accountTail: "4321" }],
  ["ICICI", "Dear Customer, Acct XX321 is credited with Rs 500.00 on 25-Nov-26 from RAVI KUMAR. UPI:633012345678-ICICI Bank.", { amount: 50000, utr: "633012345678", payerName: "RAVI KUMAR", accountTail: "321" }],
  ["SBI no currency", "Dear UPI user A/C X4321 credited by 500.00 on date 25Nov26 trf from RAVI KUMAR Refno 633012345678 -SBI", { amount: 50000, utr: "633012345678", accountTail: "4321" }],
  ["SBI", "Dear SBI User, your A/c X4321-credited by Rs.500 on 25Nov26 transfer from RAVI KUMAR Ref No 633012345678 -SBI", { amount: 50000, utr: "633012345678", accountTail: "4321" }],
  ["Axis", "INR 320.50 credited\nA/c no. XX4321\n25-11-26, 10:11:12 IST\nUPI/P2A/633055554444/JOHN D\nAxis Bank", { amount: 32050, utr: "633055554444", accountTail: "4321" }],
  ["Kotak", "Received Rs.45.00 in your Kotak Bank AC X4321 from meera@ybl on 25-11-26.UPI Ref:633000001111.", { amount: 4500, utr: "633000001111", payerVpa: "meera@ybl", accountTail: "4321" }],
  ["BoB", "Rs.750.00 Credited to A/c ...4321 thru UPI/633012340000 by ravi_okaxis. Total Bal:Rs.9,220.00CR. Avlbl Amt:Rs.9,220.00(25-11-2026 10:11:12) - Bank of Baroda", { amount: 75000, utr: "633012340000", accountTail: "4321" }],
  ["PNB", "Ac XXXXXXXX004321 Credited with Rs.99.00 , 25-11-2026 10:11:12 thru UPI:633012340001. Aval Bal 1200.00 CR . -PNB", { amount: 9900, utr: "633012340001", accountTail: "4321" }],
  ["Union", "A/c *4321 Credited for Rs:60.00 on 25-11-2026 10:11:12 by Mob Bk ref no 633012340002 Avl Bal Rs:1260.00.", { amount: 6000, utr: "633012340002", accountTail: "4321" }],
  ["Canara", "An amount of INR 1,000.00 has been CREDITED to your account XXX4321 on 25/11/2026. Total Avail.bal INR 12,200.00. - Canara Bank", { amount: 100000, accountTail: "4321" }],
  ["IDFC", "Your A/C XXXXX4321 is credited by INR 500.00 on 25/11/26 10:11. New Bal :INR 12500.00. Team IDFC FIRST Bank", { amount: 50000, accountTail: "4321" }],
];
const no: [string, string][] = [
  ["debit", "Sent Rs.500.00 From HDFC Bank A/C *4321 To SHOP On 25/11/26 Ref 633012345678"],
  ["ICICI debit naming a credit", "ICICI Bank Acct XX321 debited for Rs 500.00 on 25-Nov-26; SHOP credited. UPI:633012345678."],
  ["SBI debit no currency", "Dear UPI user A/C X4321 debited by 500.0 on date 25Nov26 trf to SHOP Refno 633012345678."],
  ["OTP", "123456 is the OTP for txn of Rs.500.00."],
  ["collect request", "ravi@okaxis has requested Rs.500.00 via UPI. Once approved the amount will be credited."],
  ["reversal", "Rs.500.00 credited to A/c XX4321 on 25-11-26 towards reversal of UPI txn 633012345678"],
  ["loan", "Pre-approved loan of Rs.5,00,000 can be credited to your A/c XX4321 now."],
  ["two amounts", "Rs.1.00 credited to A/c XX4321 from a@ybl Rs.5000.00 credited"],
  ["date is not money", "Your A/C X4321 was credited on 25.11.26"],
  ["remark forges a bigger amount", "Dear UPI user A/C X4321 credited by 1.00 on date 25Nov26 trf from credited by 5000.00 Refno 633012345678"],
];

describe("SMS parsing", () => {
  it.each(ok)("reads %s", (_n, body, want) => expect(parseCredit("", body, { sms: true })).toMatchObject({ ok: true, credit: want }));
  it.each(no)("refuses %s", (_n, body) => expect(parseCredit("", body, { sms: true }).ok).toBe(false));
});

describe("SMS senders", () => {
  const p = { bankCode: "hdfc", extraHeaders: ["MYBANK"] };
  const body = ok[0][1];
  it("splits a registered header", () => {
    expect(parseHeader("VM-HDFCBK-S")).toEqual({ header: "HDFCBK", kind: "S" });
    expect(parseHeader("ad-hdfcbk")).toEqual({ header: "HDFCBK", kind: null });
    expect(parseHeader("HDFCBK")).toEqual({ header: "HDFCBK", kind: null });
    for (const s of ["+919812345678", "9812345678", "56161", "HDFCBK <x>", "", "VM-HDFCBK-S-X"]) expect(parseHeader(s)).toBeNull();
  });
  it("reads your bank and extra headers only", () => {
    for (const s of ["VM-HDFCBK-S", "JD-HDFCBK-T", "AX-HDFCBK", "VM-MYBANK-S"]) expect(screenSms(s, body, p).verdict).toBe("read");
    for (const s of ["VM-ICICIT-S", "VM-HDFCBX-S", "VM-HDFCBK-P"]) expect(screenSms(s, body, p).verdict).toBe("skip");
  });
  it("flags a person's number pretending to be a bank", () => expect(screenSms("+919812345678", body, p).verdict).toBe("suspicious"));
  it("drops secrets and chatter", () => {
    expect(screenSms("VM-HDFCBK-S", "OTP 1234 for amount credited", p).verdict).toBe("skip");
    expect(screenSms("VM-HDFCBK-S", body + ". Never share OTP/PIN/CVV with anyone.", p).verdict).toBe("read");
    expect(screenSms("+919812345678", "Dinner at 8?", p).verdict).toBe("skip");
  });
});
