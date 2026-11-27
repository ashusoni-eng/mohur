/**
 * Where each bank's alert mail legitimately comes from. A bank may send from several domains:
 * the older .com/.net one and its .bank.in domain (RBI's bank-only registry).
 */
export interface Bank { code: string; name: string; domains: string[]; ifsc: string; /** Registered SMS headers. */ sms: string[] }

export const BANKS: Bank[] = [
  { code: "hdfc", name: "HDFC Bank", ifsc: "HDFC", domains: ["hdfcbank.net", "hdfcbank.com", "hdfcbank.bank.in", "hdfc.bank.in"], sms: ["HDFCBK"] },
  { code: "icici", name: "ICICI Bank", ifsc: "ICIC", domains: ["icicibank.com", "icici.bank.in", "icicibank.bank.in"], sms: ["ICICIB", "ICICIT"] },
  { code: "sbi", name: "State Bank of India", ifsc: "SBIN", domains: ["sbi.co.in", "alerts.sbi.co.in", "sbi.bank.in"], sms: ["SBIUPI", "SBIINB", "ATMSBI", "CBSSBI", "SBIPSG"] },
  { code: "axis", name: "Axis Bank", ifsc: "UTIB", domains: ["axisbank.com", "axis.bank.in", "axisbank.bank.in"], sms: ["AXISBK"] },
  { code: "kotak", name: "Kotak Mahindra Bank", ifsc: "KKBK", domains: ["kotak.com", "kotak.bank.in"], sms: ["KOTAKB"] },
  { code: "yes", name: "Yes Bank", ifsc: "YESB", domains: ["yesbank.in", "yes.bank.in", "yesbank.bank.in"], sms: ["YESBNK"] },
  { code: "idfc", name: "IDFC FIRST Bank", ifsc: "IDFB", domains: ["idfcfirstbank.com", "idfcfirst.bank.in", "idfcfirstbank.bank.in"], sms: ["IDFCFB"] },
  { code: "indusind", name: "IndusInd Bank", ifsc: "INDB", domains: ["indusind.com", "indusind.bank.in"], sms: ["INDUSB"] },
  { code: "federal", name: "Federal Bank", ifsc: "FDRL", domains: ["federalbank.co.in", "federal.bank.in", "federalbank.bank.in"], sms: ["FEDBNK"] },
  { code: "rbl", name: "RBL Bank", ifsc: "RATN", domains: ["rblbank.com", "rbl.bank.in", "rblbank.bank.in"], sms: ["RBLBNK"] },
  { code: "pnb", name: "Punjab National Bank", ifsc: "PUNB", domains: ["pnb.co.in", "pnb.bank.in"], sms: ["PNBSMS"] },
  { code: "bob", name: "Bank of Baroda", ifsc: "BARB", domains: ["bankofbaroda.com", "bankofbaroda.co.in", "bankofbaroda.bank.in"], sms: ["BOBSMS", "BOBTXN"] },
  { code: "union", name: "Union Bank of India", ifsc: "UBIN", domains: ["unionbankofindia.bank", "unionbankofindia.com", "unionbankofindia.bank.in"], sms: ["UNIONB"] },
  { code: "canara", name: "Canara Bank", ifsc: "CNRB", domains: ["canarabank.com", "canarabank.bank.in", "canara.bank.in"], sms: ["CANBNK"] },
  { code: "au", name: "AU Small Finance Bank", ifsc: "AUBL", domains: ["aubank.in", "au.bank.in", "aubank.bank.in"], sms: ["AUBANK"] },
  { code: "idbi", name: "IDBI Bank", ifsc: "IBKL", domains: ["idbi.co.in", "idbibank.co.in", "idbi.bank.in"], sms: ["IDBIBK"] },
  { code: "bandhan", name: "Bandhan Bank", ifsc: "BDBL", domains: ["bandhanbank.com", "bandhan.bank.in", "bandhanbank.bank.in"], sms: ["BDNSMS"] },
  { code: "indian", name: "Indian Bank", ifsc: "IDIB", domains: ["indianbank.co.in", "indianbank.in", "indianbank.bank.in"], sms: ["INDBNK"] },
  { code: "boi", name: "Bank of India", ifsc: "BKID", domains: ["bankofindia.co.in", "bankofindia.bank.in"], sms: ["BOIIND"] },
];

export const bankByIfsc = (ifsc: string) => BANKS.find((b) => b.ifsc === ifsc.slice(0, 4).toUpperCase());

/** True when host is the domain itself or a subdomain of it. "evil-hdfcbank.net" is neither. */
export const within = (host: string, domain: string) => host === domain || host.endsWith("." + domain);

/** The bank a sending host belongs to, among the banks this business uses ("any" trusts every known bank). */
export function trustedBank(host: string, bankCodes: string | string[], extra: string[]): { name: string; code: string | null } | null {
  const codes = Array.isArray(bankCodes) ? bankCodes : [bankCodes];
  if (extra.some((d) => within(host, d))) {
    const only = codes.length === 1 ? BANKS.find((b) => b.code === codes[0]) : undefined;
    return { name: only?.name ?? host, code: only?.code ?? null };
  }
  const pool = codes.includes("any") ? BANKS : BANKS.filter((b) => codes.includes(b.code));
  const b = pool.find((x) => x.domains.some((d) => within(host, d)));
  return b ? { name: b.name, code: b.code } : null;
}
