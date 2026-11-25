import { describe, expect, it } from "vitest";
import { screen, subjectLooksLikeCredit } from "../src/lib/server/mail/screen";
import { parseHeaderBlock } from "../src/lib/server/mail/headers";

const policy = { bankCode: "hdfc", extraDomains: [], authServId: "mx.google.com" };
const PASS = "mx.google.com; dkim=pass header.i=@hdfcbank.net header.s=x header.b=abc; spf=pass (google.com: domain of b@hdfcbank.net designates 1.2.3.4 as permitted sender) smtp.mailfrom=b@hdfcbank.net; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=hdfcbank.net";
const h = (o: Partial<Parameters<typeof screen>[0]> = {}) => ({ from: ["alerts@hdfcbank.net"], subject: "View: Account update for your HDFC Bank A/c", authResults: [PASS], ...o });

describe("subject filter", () => {
  it.each(["View: Account update for your HDFC Bank A/c", "❗ You have done a UPI txn. Check details!", "Transaction alert for your ICICI Bank account", "INR 500.00 was credited to your A/c", "Your account has been credited", "Money received via UPI"])("reads %s", (s) => expect(subjectLooksLikeCredit(s)).toBe(true));
  it.each(["OTP for your transaction", "Your account e-statement", "Pre-approved loan up to Rs 5,00,000", "Cashback will be credited to your account", "Lunch on Friday?", "Payment due on your credit card", "Payment reminder"])("skips %s", (s) => expect(subjectLooksLikeCredit(s)).toBe(false));
});

describe("sender checks", () => {
  it("accepts an authenticated bank alert", () => expect(screen(h(), policy).verdict).toBe("read"));
  it("rejects unknown senders and lookalikes", () => {
    for (const f of ["a@gmail.com", "alerts@evil-hdfcbank.net", "alerts@hdfcbank.net.evil.com", "alerts@hdfcbannk.net"]) expect(screen(h({ from: [f] }), policy).verdict).toBe("skip");
  });
  it("rejects another bank when one is configured", () => expect(screen(h({ from: ["a@icicibank.com"] }), policy).verdict).toBe("skip"));
  it("flags a forged From with failing authentication", () => {
    expect(screen(h({ authResults: ["mx.google.com; dkim=none; spf=fail; dmarc=fail (p=REJECT) header.from=hdfcbank.net"] }), policy).verdict).toBe("suspicious");
    expect(screen(h({ authResults: [] }), policy).verdict).toBe("suspicious");
  });
  it("ignores Authentication-Results the sender wrote", () => {
    expect(screen(h({ authResults: ["mx.google.com; dkim=pass header.i=@evil.com; dmarc=fail header.from=hdfcbank.net", PASS] }), policy).verdict).toBe("suspicious");
    expect(screen(h({ authResults: ["evil.com; dmarc=pass header.from=hdfcbank.net"] }), policy).verdict).toBe("suspicious");
  });
  it("is not fooled by comments or by DKIM for another domain", () => {
    expect(screen(h({ authResults: ["mx.google.com; dkim=fail (x; dmarc=pass header.from=hdfcbank.net); dmarc=fail header.from=hdfcbank.net"] }), policy).verdict).toBe("suspicious");
    expect(screen(h({ authResults: ["mx.google.com; dkim=pass header.i=@evil.com; spf=pass smtp.mailfrom=evil.com"] }), policy).verdict).toBe("suspicious");
  });
  it("rejects two From addresses", () => expect(screen(h({ from: ["alerts@hdfcbank.net", "x@evil.com"] }), policy).verdict).toBe("suspicious"));
  it("parses From without trusting the display name", () => {
    const p = (v: string) => parseHeaderBlock(`From: ${v}\r\nSubject: x\r\n`).headers.from;
    expect(p('"alerts@hdfcbank.net" <x@evil.com>')).toEqual(["x@evil.com"]);
    expect(p('"a, <alerts@hdfcbank.net>" <x@evil.com>')).toEqual(["x@evil.com"]);
    expect(p("HDFC Bank InstaAlerts <alerts@hdfcbank.net>")).toEqual(["alerts@hdfcbank.net"]);
    expect(p("x@evil.com (alerts@hdfcbank.net)")).toEqual(["x@evil.com"]);
  });
  it("decodes encoded subjects and folded headers", () => {
    const r = parseHeaderBlock("Subject: =?UTF-8?B?4p2XIFlvdSBoYXZlIGRvbmUg?=\r\n =?UTF-8?Q?a_UPI_txn?=\r\nAuthentication-Results: mx.google.com;\r\n  dmarc=pass header.from=x.in\r\nMessage-ID: <a@b>\r\n");
    expect(r.headers.subject).toBe("❗ You have done a UPI txn");
    expect(r.headers.authResults).toEqual(["mx.google.com; dmarc=pass header.from=x.in"]);
    expect(r.messageId).toBe("<a@b>");
  });
});
