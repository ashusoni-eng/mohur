# Changelog

## 1.1.0 (27 November 2026)

More control over where money lands, a safe place to build against the API, and checkout pages that look like yours.

### New

- **Several UPI accounts.** Add up to 20 under Configuration → UPI accounts, each with its own bank, account number and
  optional **daily and monthly limits** (for example ₹1 lakh a month for NPCI's small-merchant category). New payments go
  to the default account until it reaches a limit, or are **spread at random** across accounts with room left
  (Payment rules). Each payment is tied to its account, and a bank alert only confirms it if the bank and last digits
  match. Usage bars show how much each account has taken today and this month. An account with payments still waiting is
  paused instead of deleted.
- **Test mode.** Create a `mhr_test_` key under Developers. Test payments carry no money: no UPI ID or QR is shown,
  they are never matched to bank alerts, they stay out of the dashboard, and they only reach test webhook endpoints.
  Move them to paid, on hold, declined or expired with `POST /api/v1/payments/{id}/simulate`, or with the buttons on the
  test checkout page. The Payments page has a **Test data** view.
- **Look up payments by your own order number.** `GET /api/v1/payments/{id}` now also accepts the `reference` you sent
  (newest wins), and `GET /api/v1/payments?reference=` filters by it.
- **`upi_intent`** in the payment object: a `upi://pay` link that opens the customer's UPI app directly.
- **Customer email and phone**, and a 50-character **`note`** shown in the customer's UPI app next to the payment ID.
- **`upi_account_id`** to pin an API payment to one account instead of using rotation.
- **Allowed redirect domains.** List your domains under Developers and any other `redirect_url`, on API payments or
  payment links, is refused with `422 redirect_not_allowed`. Subdomains are included.
- **Ordered, deduplicable webhooks.** Every delivery carries `mohur-event-id` (the same in every retry and for every
  endpoint) and `mohur-sequence` (counts up per payment), and the body now includes `sequence` and `livemode`.
- **Checkout look.** Your brand colour and logo on checkout and payment-link pages (Configuration → Checkout look).
  Logos must be PNG, JPEG or WebP under 200 KB; colours too light for white text are refused.
- **Public API reference** at `/docs`: authentication, test mode, every endpoint, the payment object, webhook headers,
  statuses, errors and limits, with examples in curl, Node.js, PHP and Python.
- The payment drawer shows which UPI account a payment was paid into, plus the customer's email and UPI note.

### Changed

- Configuration → **Bank and UPI** is now **UPI accounts**. `PUT /api/settings/bank` is replaced by
  `/api/upi-accounts` (`GET`, `POST`) and `/api/upi-accounts/{id}` (`PUT`, `DELETE`).
- New API keys start with `mhr_live_` or `mhr_test_`. Older `mhr_` keys keep working as live keys.
- Mail and SMS screening trust the banks of all your UPI accounts, and the "paid into another account" check compares
  against every saved account.

### Upgrading from 1.0.0

Back up your data directory (the database and `secret.key`), deploy, and restart. The database migrates itself in one
transaction on first start: your existing UPI details become your first, default UPI account, and existing keys and
webhook endpoints stay live. Integrations that ignore unknown JSON fields need no change.

### Not included

Direct Paytm, PhonePe or Google Pay verification. Their official status APIs need you to be onboarded as their gateway
or enterprise customer, usually with a gateway fee, and only cover payments through their own merchant IDs. Mohur does
not use unofficial endpoints. Your bank's alert remains the free way to confirm a payment.

The Android app is unchanged at 1.0.1.

## 1.0.0

First public release: free, open-source UPI payments confirmed by your bank's email or SMS.

- Payment links and QR codes, a live checkout page, the on-hold and UTR flow
- Gmail (app password or Google sign-in) and the Android SMS app (Android 8+)
- Dashboard, payments, bank alerts with re-read, manual approve and decline
- REST API, idempotent creation, signed webhooks with retries
- Many businesses on one server, with permanent account deletion
