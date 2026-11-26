# Mohur

**Open source · 100% free · MIT licence**

A UPI payment gateway with no gateway fee. Customers pay your own UPI ID; Mohur reads your bank's
credit alert, from Gmail or from SMS on a paired Android phone, and confirms the payment. (A *mohur* was the gold coin of the Mughal mints.)

TypeScript, Next.js 16, React 19, Tailwind 4, SQLite. Android app in Kotlin.

**Live:** https://mohur.sanjeevaniprime.com

![Checkout](docs/checkout.png)

<img src="docs/app.png" alt="Android app" width="260">

## Open source and free

Mohur is open source under the [MIT licence](LICENSE). It costs nothing: no fees, plans or limits, for personal or
commercial use.

- **Your money stays yours.** Customers pay your own UPI ID. Mohur never holds or moves money.
- **Host it yourself.** Clone it and run it on your own server, so your payments, settings and Gmail access stay with you.
- **Check it.** Every line is public, including exactly how a bank alert is trusted and matched (see below).

Like any software, it comes with no warranty. Test it with a ₹1 payment before relying on it, and keep it updated.

## Self-host

```bash
git clone https://github.com/ashusoni-eng/mohur.git
cd mohur
npm ci && npm run build
cp .env.example .env   # set APP_URL and APP_SECRET
npm start              # put it behind nginx or Caddy with https
```

Then create your account, add your UPI ID and bank, and connect Gmail or pair your Android phone.

## Run locally

```bash
npm install
npm run dev        # http://localhost:4100
npm run seed       # optional demo account with 60 days of invented payments
npm test
```

For production: set `APP_URL` and `APP_SECRET` (see `.env.example`), then `npm run build && npm start`.

It must run as **one long-lived Node process** on a persistent disk (VPS, Docker, Railway, Render, Fly).
Serverless hosts such as Vercel will not work, because the mailbox listener has to stay connected.
Back up `data/` including `secret.key`: without the key, saved Gmail access and account numbers cannot be read.

## Deploy

Mohur needs **one long-lived Node process** on a server with a persistent disk (a VPS, Docker, Railway, Render or Fly).
Serverless hosts such as Vercel will not work: the mailbox listener and payment clocks must keep running, and the database is a file.

```bash
npm ci && npm run build
APP_URL=https://pay.example.com npm start   # behind a reverse proxy with https; see .env.example
```

Back up `DATA_DIR` (the database and `secret.key`) and keep the process on loopback behind nginx or similar.

## Set up

1. Create an account.
2. Configuration → Bank and UPI: UPI ID, account number, IFSC, bank, branch.
3. Configuration → Gmail: the address your bank mails, plus a Google
   [app password](https://myaccount.google.com/apppasswords). Or set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   for a "Continue with Google" button (Gmail API, `gmail.readonly`, redirect URI `{APP_URL}/api/mail/google/callback`).
4. Configuration → Alert Lab: paste a real alert from your bank and check that it is read correctly.
5. Send yourself ₹1 and watch it settle.

**Check first that your bank emails you for every UPI credit.** Some send only SMS, or only above a minimum amount.
Pair a phone (below) to cover that. With neither alert, payments stay on hold for you to approve.

## How a payment moves

```
pending ──customer taps "I have paid"──▶ verifying ──60 s, no mail──▶ on_hold ──▶ paid / declined
   └────────────── bank mail at any point ──────────────▶ paid
   └── never claimed, matching window over ──▶ expired
```

- The 60-second clock starts at "I have paid" by default. Configuration → Payment rules can start it when the QR appears.
- Browsers get status over server-sent events, with a 5-second poll as a fallback.
- A held payment the customer says they paid is also looked for again: Gmail is re-read when it goes on hold and every two minutes for twenty. **Check mail again** on a payment, or on Bank alerts, does it on demand.
- A held payment keeps listening (60 minutes by default). The customer can submit a UTR, and the merchant can approve or decline.

## How a mail is trusted

1. **Headers only.** Subject must look like a credit alert. Otherwise the body is never downloaded.
2. **Sender.** Exact bank domain, and Gmail's own topmost `Authentication-Results` must show aligned DKIM or DMARC. Forgeries go to Bank alerts → Suspicious.
3. **Body.** One unambiguous completed credit. Debits, refunds, offers, pending and failed transfers, or two different amounts are refused.
4. **Match.** Account digits agree, UTR unused, and the amount equals exactly one open payment created before the mail. Equal amounts in flight are told apart by paise, and an amount stays reserved until its window ends.

Anything short of that waits for a person under Bank alerts → Needs review.

## Phone app (bank SMS)

`mobile/` is a native Android app (Kotlin, about 1 MB, Android 8+). It wakes for each SMS, even when closed, and sends
bank credit messages to your server. Offline messages are kept and sent later with their original arrival time.
iPhones do not let apps read SMS.

1. Install it on the phone whose number is registered with your bank. Connect it by USB with USB debugging on, then:

   ```bash
   adb install -r public/download/mohur.apk
   ```

   It can also be downloaded from Configuration → Phone (SMS), but Google Play Protect often blocks downloaded apps that read
   SMS, especially in India. Google Play itself does not accept apps like this one.
2. Configuration → Phone (SMS) → Show pairing code, and scan it in the app.
3. Allow SMS. If Android greys it out: tap Allow in the app once, then App info → ⋮ → Allow restricted settings → Permissions → SMS. Or grant it
   over USB with `adb shell pm grant in.mohur.app android.permission.RECEIVE_SMS` (and `READ_SMS`). `/install` on your site has every step.
4. Tap Fix if the app offers to turn off battery saving. On Xiaomi, Oppo, Vivo and Realme also turn on Autostart.

The phone must be able to reach the server. With `APP_URL=http://localhost:4100` the code uses this computer's Wi-Fi address, so
it works on the same Wi-Fi only. For real use, host Mohur on https.

**What is trusted.** Only your bank's registered sender (for example `VM-HDFCBK-S`), never a phone number, and never promotional
(`-P`) messages. OTPs and personal messages are dropped on the phone. Requests are signed with a key that is shown once in the
pairing code and then kept in the phone's keystore. SMS has no equivalent of DKIM, so it is the weaker of the two channels: keep the
bank selected (not "Any supported bank") and the account number filled in, so the last digits are checked too.

**Same credit twice.** Mail and SMS for one credit count once: by UTR, or by the reserved amount when one of them leaves the UTR out.

Build and test (needs JDK 17+ and Android SDK 35; set `sdk.dir` in `mobile/local.properties`):

```bash
cd mobile && ./gradlew testDebugUnitTest assembleRelease
```

Back up `mobile/mohur-release.jks` and `mobile/keystore.properties`. They are not in git, and without them you cannot ship an update
that installs over the old app. Copy a new build to `public/download/mohur.apk`.

## Layout

| Path | What |
|---|---|
| `src/lib/server/mail/` | `screen` (headers), `parse` (body), `ingest` (matching), `imap`, `google` |
| `src/lib/server/payments.ts` | Payment state machine; `settleInTx` is the only way to become paid |
| `src/lib/server/devices.ts`, `mail/sms.ts` | Paired phones and SMS intake |
| `mobile/` | Android app |
| `src/lib/server/engine.ts` | Mailbox listeners, clocks, webhook sender |
| `src/app/api/v1` | REST API (documented in-app under Developers) |
| `src/lib/banks.ts` | Trusted bank domains |

## Limits

- UPI only, ₹1 to ₹1,00,000 per payment. No refunds: Mohur cannot move money.
- Bank domains, SMS senders and alert wording vary and change. Test yours in Alert Lab before relying on it.
- Collect only into your own account. Collecting on behalf of others in India needs an RBI payment aggregator licence.
