# Real providers for push, SMS, email and card payments — design

Status: draft for review. Builds on `main` as of 2026-10-16.

## 1. Intent

Every outside service in DriveOS sits behind an adapter with a fake or dev implementation. This design adds production implementations and the configuration that selects them, so a school can run on real push notifications, SMS, email and (where available) card payments by setting environment variables, with no code change. The Albanian and Kosovar card acquirer is handled in the fiscal/local-payments design; this design covers what is documented and reachable today.

## 2. Goals, non-goals

Goals
- Push through Expo's push service (the mobile app already registers Expo tokens).
- SMS through Twilio (works for sending to Albania and Kosovo; sender-id rules per country are configuration).
- Email through any SMTP relay (already implemented; add the production options: TLS, auth, from-name, DKIM is the relay's job).
- Card payments through Stripe Connect for schools in countries Stripe serves (the EU side of the business), behind the existing `PaymentProvider` interface, including school onboarding, checkout, refunds and signed webhooks.
- Provider selection by environment: `PUSH_PROVIDER=console|expo`, `SMS_PROVIDER=console|twilio`, `PAYMENT_PROVIDER=fake|stripe`, each with its own credentials, validated at boot.
- Operational safety: retries with backoff for transient errors, a circuit that stops hammering a dead provider, and the existing alerts for failures.

Non-goals
- No Viber, no Firebase direct (Expo fronts both stores), no SendGrid API (SMTP is enough).
- No Albanian/Kosovar acquirer here (see the fiscal/local-payments design).
- No multi-provider routing per school; one provider per deployment.

## 3. Constraints

- Provider SDKs only inside `apps/api/src/adapters/**`.
- Secrets only via env (`zod`-validated), never in the database, except per-school provider account references.
- Webhook signature verification before any database access; the school is resolved with the existing `billing_school_for_payment` definer function.
- No behaviour change for the fakes; tests keep running on them.

## 4. How it works

### 4.1 Push — `ExpoPushSender`

`POST https://exp.host/--/api/v2/push/send` with batches of up to 100 messages, `Authorization: Bearer EXPO_ACCESS_TOKEN` when set. Map the ticket status: `ok` → `sent`; `DeviceNotRegistered` → `invalid_token` (the existing subscriber then prunes the device); other errors → thrown, so the notification row ends `failed` with `last_error`. Receipts are fetched by a 15-minute job (`POST /--/api/v2/push/getReceipts`) for tickets stored in a small `push_tickets` table; a `DeviceNotRegistered` receipt also prunes the device. Env: `PUSH_PROVIDER`, `EXPO_ACCESS_TOKEN` (optional).

### 4.2 SMS — `TwilioSmsSender`

`POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` with basic auth; `From` is `TWILIO_FROM` (an alphanumeric sender id or a number; per-country rules documented in OPERATIONS). Twilio errors 21xxx (invalid number) → throw a typed `InvalidRecipientError` so the notification is `skipped`, not retried; 429/5xx → retry with backoff (3 attempts, jittered). Env: `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Rate limit: at most `SMS_MAX_PER_MINUTE` (default 60) per process via a token bucket.

### 4.3 Email — `SmtpEmailSender` hardening

Already SMTP. Add: `SMTP_SECURE`, `SMTP_USER`/`SMTP_PASSWORD`, `EMAIL_FROM` ("DriveOS <no-reply@…>"), `EMAIL_REPLY_TO` optional, connection pooling, and an HTML part for templates that provide one (invitation, lead captured, review request) with the text part kept.

### 4.4 Card payments — `StripePaymentProvider` (Stripe Connect, Express accounts)

- `connectAccount`: create an Express account (country from the school), store `acct_…` as `accountRef`, return the onboarding link; `status` is `pending` until the `account.updated` webhook reports `charges_enabled`.
- `createCheckout`: a Checkout Session on the connected account (`stripeAccount` header), `mode: payment`, one line item in the school currency, `client_reference_id = paymentId`, success/cancel URLs to the mobile deep link or admin page; `providerRef` is the session id.
- `refund`: `refunds.create` on the connected account with the payment intent from the session; status mapped.
- `verifyWebhook`: `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`; map `checkout.session.completed` → `payment.succeeded`, `checkout.session.expired` / `payment_intent.payment_failed` → `payment.failed`, `account.updated` → a new `PaymentWebhookEvent` type `account.updated` that the handler routes to `school` (activates the account). The `PaymentWebhookEvent` union grows accordingly (shared DTO).
- Platform fees: none in Phase 1 (take rate is Phase 2); the design keeps `application_fee_amount` as a single place to add it.
- Env: `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_URL`.

### 4.5 Selection and health

`adapters.module.ts` chooses implementations from env; boot fails with a clear message when a provider is selected without its credentials. `GET /v1/health` (platform admin) adds a `providers` block: which implementation is active per adapter and the last error time. The webhook-failure alert already exists; add `provider_errors` (count of thrown adapter errors in the last 15 minutes).

### 4.6 Documentation

OPERATIONS §5 (env table), a new §13 "Providers" (how to get credentials: Expo access token, Twilio sender id per country, Stripe Connect platform setup, webhook endpoints to register: `/v1/webhooks/payments/stripe`), and the mobile `app.json` note for Expo push (projectId).

## 5. Decisions taken (my calls)

- Twilio rather than a local SMS gateway: documented API, reaches both countries; a local gateway can be a second `SmsSender` later.
- Stripe only for countries Stripe serves; the adapter refuses `connectAccount` for `AL`/`XK` with a clear error naming the local-payments design.
- Expo rather than FCM/APNs direct: the app already uses Expo tokens, one integration covers both stores.

## 6. Testing

Each real adapter is tested against recorded HTTP fixtures (nock) for success, invalid recipient/token, rate limit and server error paths; the fake adapters remain the default in tests. Webhook verification tests use Stripe's signing scheme with a test secret. Boot validation tests for each provider's env. The notification dispatcher tests gain the `skipped`-on-invalid-recipient case. An opt-in live smoke script per provider (`pnpm --filter @driveos/api providers:smoke`) that sends one push/SMS/email and creates one Stripe test checkout when credentials are present.

## 7. Decisions from the builder check (my calls)

1. **Stripe failure mapping:** only `checkout.session.expired` maps to `payment.failed`; `payment_intent.payment_failed` is ignored (a declined card does not end the session; the learner can retry).
2. **`account.updated`:** a new definer function `school_for_payment_account(provider, account_ref)`; the payment-webhook controller routes account events to a school command `UpdatePaymentAccountStatus(schoolId, status)` in the school scope; `charges_enabled` true → `active`, false → `pending`. Added to SPEC §6.2 and the definer test.
3. **Refunds settle on confirmation.** `IssueRefund` writes the refund row `pending` and calls the provider; the ledger entry and credit note are written when the refund is confirmed (`refund.updated` succeeded → `SettleRefund`), or immediately when the provider returns `succeeded` synchronously (the fake). A failed refund marks the row `failed`, writes nothing else, and notifies the office. This is a billing change: refund tests move to the two-step flow.
4. **Outages reschedule, they do not fail.** A thrown provider error (and an open circuit) reschedules the notification with backoff (1, 5, 30 minutes; 3 attempts) while `skipAfter` allows; only then `failed`. Invalid recipient/token is `skipped` at once.
5. **Health:** the providers block goes on the platform-admin alerts endpoint, not the public health route; error counts are kept in Redis per provider and summed across processes.
6. **Expo receipts:** `push_tickets` is a tenant table in messaging (`school_id, notification_id, device_id, ticket_id, created_at`); the 15-minute job runs per school through `PerSchoolJobs`; a `DeviceNotRegistered` receipt appends `DeviceTokenInvalidated` with the stored `notificationId`.
