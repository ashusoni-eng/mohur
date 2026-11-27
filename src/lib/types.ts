export type PaymentStatus = "pending" | "verifying" | "on_hold" | "paid" | "declined" | "expired";
export const OPEN_STATUSES: PaymentStatus[] = ["pending", "verifying", "on_hold"];

export interface Merchant { id: string; name: string; business: string; email: string; created_at: number }

export interface Settings {
  merchant_id: string; upi_id: string | null; payee_name: string | null; account_holder: string | null;
  account_number_enc: string | null; account_tail: string | null; ifsc: string | null; bank_name: string | null;
  branch_name: string | null; bank_code: string; extra_domains: string; extra_headers: string; verify_seconds: number; qr_minutes: number;
  hold_minutes: number; timer_start: "claim" | "qr"; amount_mode: "off" | "smart" | "strict"; show_bank: number; support_contact: string;
  rotation: "default" | "random"; redirect_hosts: string; brand_color: string | null; brand_logo: string | null;
}

export interface MailAccount {
  merchant_id: string; kind: "imap" | "google"; email: string; secret_enc: string;
  status: "connecting" | "live" | "retrying" | "error"; last_error: string | null; last_checked_at: number | null;
  last_uid: number | null; uid_validity: string | null; cursor_ms: number | null; screened: number; connected_at: number;
}

export interface Link {
  id: string; merchant_id: string; slug: string; title: string; description: string; amount: number | null; min_amount: number | null;
  reusable: number; ask_name: number; ask_contact: number; redirect_url: string | null; expires_at: number | null; active: number; views: number; created_at: number;
}

export interface Payment {
  id: string; merchant_id: string; link_id: string | null; source: "link" | "qr" | "api"; title: string;
  amount: number; payable: number; exclusive: number; status: PaymentStatus; customer_name: string | null; customer_contact: string | null;
  qr_until: number; verify_until: number | null; match_until: number; claimed_at: number | null; customer_utr: string | null;
  held_at: number | null; settled_at: number | null; method: "email" | "sms" | "utr" | "manual" | null; utr: string | null;
  payer_vpa: string | null; payer_name: string | null; mail_id: number | null; decision_note: string | null;
  redirect_url: string | null; reference: string | null; idempotency_key: string | null; created_at: number;
  upi_account_id: number | null; test: number; event_seq: number; customer_email: string | null; note: string | null;
}

export interface UpiAccount {
  id: number; merchant_id: string; label: string; upi_id: string; payee_name: string; account_holder: string; account_number_enc: string | null;
  account_tail: string | null; ifsc: string; bank_name: string; branch_name: string; bank_code: string; daily_limit: number | null;
  monthly_limit: number | null; active: number; is_default: number; created_at: number;
}

export interface Device {
  id: string; merchant_id: string; label: string; secret_enc: string; status: "pairing" | "active"; pair_until: number; model: string | null;
  app_version: string | null; sms_ok: number; battery_ok: number; received: number; last_seen_at: number | null; last_sms_at: number | null; created_at: number;
}

export interface PaymentEvent { id: number; payment_id: string; type: string; detail: string; at: number }

export type MailOutcome = "matched" | "unmatched" | "ambiguous" | "duplicate" | "ignored" | "suspicious" | "dismissed";
export interface Mail {
  id: number; merchant_id: string; message_id: string; source: string; from_addr: string; subject: string; received_at: number;
  outcome: MailOutcome; reason: string; bank: string | null; amount: number | null; utr: string | null; payer_vpa: string | null;
  payer_name: string | null; account_tail: string | null; excerpt: string; payment_id: string | null; created_at: number;
}
