# Albanian language (sq) across API, admin and mobile — design

Status: draft for review. Builds on `main` as of 2026-10-16.

## 1. Intent

The product is sold in Albania and Kosovo, where the owner, the office, the instructor, the learner and the parent all expect Albanian. Everything already goes through the translation layer with English only. This design adds Albanian as a first-class language in the three apps and in everything the server renders (notifications, emails, invoice PDFs, error messages), chooses the language per user and per school the way people expect, and sets up the process so new strings cannot ship without an Albanian version.

## 2. Goals, non-goals

Goals
- `sq` locale files for the API (187 strings), admin (about 1,000), mobile (about 400), reviewed for the driving-school vocabulary used in Albania and Kosovo (patentë, autoshkollë, instruktor, orë praktike, provim teorik/praktik, kategoria B, fatura, kredite…).
- Language choice: mobile follows the device language with the user's saved preference first; admin follows the user's saved preference, defaulting to the school's locale; server-side renders (notifications, PDFs) use the recipient user's locale, else the school's.
- A language switch in both apps (account screen / user menu) that saves `users.locale` through `PATCH /v1/me` (new field `locale`).
- School locale selectable as `sq` or `en` in school settings, used as the default for new users and for the public page.
- Number, date, currency and plural formatting through `Intl` with the active locale (already locale-aware; verify for `sq`).
- A test in each app that fails when a key exists in `en` and not in `sq` (and vice versa), so new strings always ship translated.
- Public enrolment page in the school's locale, including the consent text version `lead-consent.v1` in Albanian (legal text reviewed before launch).

Non-goals
- No Serbian or Macedonian in this design; the mechanism supports adding them.
- No machine translation at runtime.

## 3. How it works

- Add `sq.json` next to each `en.json`; register `sq` in the three i18n setups (`supportedLngs`, `resources`); mobile `pickLanguage` recognises `sq`; admin initialises from the session.
- `users.locale` already exists; `PATCH /v1/me` is new (identity), accepts `{ locale }` only; `MembershipDirectory.localesOf` already feeds the dispatcher.
- Albanian plural rules are simple (one/other) and i18next handles them; keys with counts use `_one`/`_other`.
- Invoice PDFs: the invoice policy's `translate` gets the school locale; the PDF text keys get Albanian values.
- Translation process: the English file is the source of truth; `sq.json` is generated the first time from a glossary-driven translation pass and then hand-reviewed by a native speaker (Ervin) in a single review file (`docs/i18n/sq-review.md` listing every key with en/sq side by side, sorted by screen). Later changes add keys in both files in the same commit (the parity test enforces it).

## 4. Decisions taken (my calls)

- Default locale for new schools created with country `AL` or `XK` is `sq`.
- The admin app language follows the user, not the browser, because office staff share machines.
- Keys stay in English; only values are translated.

## 5. Testing

Parity tests in all three apps; snapshot tests of a few rendered notifications and one invoice PDF in `sq`; a Playwright mock scenario that switches the admin to Albanian and checks the navigation labels; a mobile flow test for `pickLanguage(['sq-AL'])`.
