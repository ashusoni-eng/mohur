import os from "node:os";
import path from "node:path";

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:4100").replace(/\/+$/, "");
  },
  /** Address a phone can reach. "localhost" on a phone is the phone, so fall back to this machine's LAN address. */
  get phoneUrl() {
    const u = new URL(this.appUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return this.appUrl;
    const lan = Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address));
    return lan ? `http://${lan.address}:${u.port || 80}` : this.appUrl;
  },
  get dataDir() {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_DIR || "./data");
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get signups() {
    return process.env.SIGNUPS !== "closed";
  },
  get simulator() {
    const v = process.env.ENABLE_SIMULATOR;
    return v ? v === "1" : !this.isProd;
  },
  get google() {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    return id && secret ? { id, secret } : null;
  },
  get trustProxy() {
    return process.env.TRUST_PROXY === "1";
  },
  imap: {
    get host() {
      return process.env.IMAP_HOST || "imap.gmail.com";
    },
    get port() {
      return Number(process.env.IMAP_PORT || 993);
    },
    get secure() {
      return process.env.IMAP_SECURE !== "0";
    },
  },
  /** The server whose Authentication-Results header we believe. */
  get authServId() {
    return (process.env.MAIL_AUTHSERV_ID || "mx.google.com").toLowerCase();
  },
};
