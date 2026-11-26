# Contributing

Thanks for helping. Changes reach `main` through pull requests only.

1. Fork the repository and create a branch for your change: `git checkout -b fix-hdfc-sms-format`.
2. Install and run it: `npm install && npm run dev` (http://localhost:4100). `npm run seed` adds a demo account.
3. Keep the checks green: `npm run typecheck && npm test`. Add a test for any change to how alerts are read or matched,
   with invented names and numbers; never real account details, UPI IDs or emails.
4. Open a pull request against `main` that says what changed and how you checked it.

New bank email or SMS formats are especially welcome: add the wording to `tests/parse.test.ts` or `tests/sms.test.ts`
and the sender to `src/lib/banks.ts`.

Found a security problem, such as a way to make a forged alert confirm a payment? Please report it privately to the
maintainer instead of opening a public issue.
