# Albania and Kosovo: local card payments and fiscal invoicing — design

Status: draft for review. Builds on `main` as of 2026-10-16. Source: `.context/reports/DriveOS premium features.md` ("Fiscalisation and local payments gate every paid feature") and OPERATIONS §9.

## 1. Intent

Nothing can be sold in Albania until every invoice is fiscalised in real time with the tax authority, and card payments need a local acquirer because Stripe does not serve Albania or Kosovo. Both depend on contracts and API documentation DriveOS does not have yet. This design builds everything up to that line, so that the day the credentials arrive the remaining work is one adapter file per provider: the invoice model carries the Albanian fields, every invoice goes through a fiscalisation step with a queue and retry, offline invoices are re-registered within the legal window, and the acquirer slot is a documented, tested interface with a fake behind it.

## 2. What is known and what is not

Known (from the research report and OPERATIONS §9)
- Albania: every invoice must be registered in real time with the tax authority's central platform and carry the codes it returns; invoices issued offline must be registered within 48 hours; invoices are kept 10 years. Only certified software connected with the business's electronic certificate can register. The practical route is a certified provider's API (candidates in the report: fature.al, Elif, easyInvoice, devPOS).
- Kosovo: moving from fiscal devices to electronic fiscalisation and certified fiscal software; the exact obligations for small service businesses are still unclear.
- Cards: Albania has raiAccept (Raiffeisen) and POK; Kosovo needs a bank acquirer. Merchant fees and API documentation were not found.

Not known: the exact field names, code formats, certificate handling and endpoints of any provider. Every provider-specific detail below is therefore an adapter interface, not an implementation.

## 3. Goals, non-goals

Goals
- `InvoicePolicy` for Albania (`AlbaniaInvoicePolicy`): seller and buyer fields the law needs (seller NUIS/NIPT, business unit code, operator code, software code; buyer tax id for business buyers), invoice numbering per business unit per year, totals with Albanian VAT rates, PDF with the fiscal codes and a QR code placeholder filled from the fiscalisation result.
- A `FiscalizationProvider` adapter: `register(invoice) → { fiscalRef (NIVF-like), issuerRef (NSLF-like), qrPayload, registeredAt }`, `registerCorrective(creditNote, original)`, with a fake that returns deterministic codes. One implementation per provider later.
- Fiscalisation runs after the invoice is issued, from the worker, with a queue, retry and the 48-hour deadline alert; the invoice row stores the codes; the PDF renders them; the student app shows "fiscal receipt pending" until done.
- Kosovo: an `InvoicePolicy` variant with Kosovo VAT and fiscal number fields, sharing the same provider interface (no implementation yet).
- Local acquirer: a documented `PaymentProvider` implementation skeleton `LocalAcquirerPaymentProvider` driven by a small config (base URL, merchant id, HMAC secret) with the request/response mapping in one file, plus a fake hosted-checkout page like the current fake, so the whole flow (checkout → redirect → webhook → invoice → fiscalisation) is testable end to end before a real acquirer exists.
- Per-school fiscal configuration in admin: tax regime (VAT registered or not), NUIS/NIPT, business unit code, operator code, certificate upload (stored encrypted via object storage), provider selection and credentials.

Non-goals
- Certification of DriveOS itself as fiscal software.
- Any claim of legal compliance before a certified provider is connected and an accountant has reviewed the output.

## 4. How it works

### 4.1 Data

`invoices` gains: `fiscal_status (not_required | pending | registered | failed)`, `fiscal_ref`, `fiscal_issuer_ref`, `fiscal_registered_at`, `fiscal_qr`, `fiscal_attempts`, `fiscal_last_error`, `business_unit_code`, `operator_code`, `software_code` (snapshotted at issue). `invoice_counters` keyed by `(school_id, series, business_unit_code)`.

`school_fiscal_settings` (school module): `school_id, country ('AL' | 'XK' | other), vat_registered, tax_id, business_unit_code, operator_code, software_code, provider, provider_config_enc, certificate_document_id, status`.

Buyers: `students` gains `buyer_tax_id` (optional, for business buyers paying for an employee's course).

### 4.2 Flow

1. Invoice issued (existing) → if the school's fiscal settings say fiscalisation is required, `fiscal_status = pending` and `InvoiceIssued` already fires.
2. Worker subscriber `billing.fiscalize` (serialised per school): calls `FiscalizationProvider.register`; on success stores the codes, sets `registered`, appends `InvoiceFiscalized`; on a retryable error retries with backoff up to the deadline; on a hard error sets `failed`, appends `InvoiceFiscalizationFailed`, and the alert `fiscal_backlog` fires (any `pending` or `failed` invoice older than 24 h; the legal window is 48 h).
3. Credit notes follow the same path with `registerCorrective`.
4. The PDF shows the fiscal codes and a QR when registered, and the text "Fiscal registration pending" otherwise; the student app and admin show the status.
5. Admin "Fiscal" settings page per school; a "Fiscal queue" view in the money inbox with retry.

### 4.3 Local acquirer skeleton

`LocalAcquirerPaymentProvider` implements `PaymentProvider` against a generic hosted-checkout shape (create order → redirect URL; callback with HMAC; status query). The mapping functions (`toCreateOrderRequest`, `fromCallback`) are isolated so that fitting a real provider means editing one file and its fixtures. A `FakeLocalAcquirer` serves the same shape in dev. OPERATIONS documents the checklist to onboard a real acquirer: credentials, callback URL, test cards, settlement currency, refund API.

## 5. Decisions taken (my calls)

- Fiscalisation is asynchronous after issue, not inside the request: the tax platform's latency and outages must not block a desk payment; the 48-hour window permits it.
- Albanian VAT applies as configured per school; the invoice policy does not decide whether a school is VAT registered.
- Kosovo gets a policy and settings, no provider, until the obligations are clear.
- The acquirer skeleton is generic hosted checkout; if the chosen acquirer is API-only (card data on our side), that is out of scope (PCI).

## 6. Testing

Policy unit tests (numbering, VAT, required fields, PDF content), fiscalisation subscriber with the fake provider (success, retry, deadline alert, corrective), invoice status in API and apps, settings routes with cross-tenant fixtures, the acquirer skeleton end to end with the fake, and a documented "manual acceptance with the certified provider's sandbox" checklist for when credentials exist.

## 7. Decisions from the builder check (my calls)

1. **Per-school merchant accounts.** The acquirer skeleton takes its merchant id and HMAC secret from `school_payment_accounts` (new encrypted `secret_enc` column), not from env. Webhook order: parse the unverified reference → resolve the school with `billing_school_for_payment` → load the school's secret inside the school scope → verify; a bad signature is a 401 recorded in `payment_webhook_failures`. `connectAccount` for this provider stores the credentials the owner types in (no onboarding redirect).
2. **Signing at issue is supported but optional.** `FiscalizationProvider` gets an optional `signAtIssue(invoice) → issuerRef` used inside the issue transaction when the provider needs DriveOS to sign with the school's certificate (local crypto, fast); `register` runs later in the worker and returns the tax platform's code. Providers that hold the certificate themselves implement only `register`. The certificate upload exists for the first case and is optional.
3. **Delivery waits for registration.** For schools with fiscalisation on, the `invoice_issued` notification and the PDF download for students and parents wait for `InvoiceFiscalized`; staff can view the pending PDF (watermarked "pending fiscal registration").
4. **Production before a provider exists:** `school_fiscal_settings.status` is `off` by default (invoices `not_required`). Switching to `on` requires complete settings and a non-fake provider; the fake provider refuses to start in production. With `on` and incomplete settings, issuing is blocked with 409 `fiscal_settings_incomplete` so a school never issues unregistrable invoices.
5. **Business buyers:** a payment may carry `buyer: { companyName, taxId, address }`; it is snapshotted as the invoice buyer. No e-invoice delivery to companies in this design.
6. **Kosovo:** `not_required` by default; cash receipts stay on the school's fiscal device outside DriveOS until the obligations are confirmed; documented in OPERATIONS §9.
