# WhatsApp AI front desk — design

Status: draft for review. Source: `.context/reports/DriveOS premium features.md` §3. Builds on `main` as of 2026-10-16.

## 1. Intent

Owners and instructors are in the car most of the day; enquiries arrive on WhatsApp and go unanswered for hours. The front desk is an assistant on the school's WhatsApp number that answers the routine questions (prices, documents, exam steps, opening hours) from the school's own knowledge, captures the enquiry as a lead, offers free first-lesson slots and books one through DriveOS's normal booking command, and hands anything else to a human in the existing chat. It never invents prices or legal rules: it answers only from the school's knowledge base and live DriveOS data.

Sold as an add-on (about €29 a month with about 300 conversations included), to any plan.

## 2. Goals, non-goals, anti-goals

Goals
- Reply on WhatsApp within seconds, in the language the person writes in (Albanian, English, others as the model allows), 24/7.
- Answer only from: the school's knowledge base entries, the public page data (prices flagged public, instructors, opening hours, branches), and live queries (free slots).
- Capture every new conversation as a lead (same `leads` table and inbox as the enrolment page; source `whatsapp`).
- Book a lesson for an existing student with credits through `BookLesson` (so clash and credit rules apply); for a new person, capture the lead with their preferred start time so the office calls back.
- Hand off to staff on request, on uncertainty, or on anything outside the knowledge base; staff continue in the admin inbox and the person keeps talking on WhatsApp.
- Meter conversations per school per month for billing.

Non-goals
- No payments over WhatsApp.
- No marketing broadcasts; the desk only replies within WhatsApp's 24-hour customer-service window.
- No Viber in this design; the channel is an adapter so Viber can be added later.
- No voice notes or images in v1 (the desk answers "I can only read text for now, a colleague will look at this" and hands off).

Anti-goals
- A made-up price, document list or legal rule. Every factual sentence must trace to a knowledge entry or a live query.
- A booking that bypasses credit or clash rules.
- Leaking one school's knowledge or students to another school's number.
- Staff not knowing a conversation happened.

## 3. Constraints

- Everything through adapters: `MessagingChannel` (WhatsApp Business Cloud API implementation + fake) and `Assistant` (Anthropic SDK implementation + fake). No SDK calls outside them.
- The assistant runs in the worker, never inside an HTTP request; the webhook only stores the inbound message and emits an event.
- Model: Claude Opus 5.5 (`claude-opus-5-5`) with adaptive thinking at effort `low` for routine turns; configurable by env. Server-side refusal fallbacks enabled (`fallbacks: "default"`). The implementer reads the claude-api skill's TypeScript tool-use reference before writing the adapter.
- Tenant isolation: the inbound webhook resolves the school from the WhatsApp phone-number id through a named `SECURITY DEFINER` function (`messaging_school_for_channel_account`), like payment webhooks.
- Privacy: conversation transcripts are tenant data with a retention setting (default 12 months); minors' data handling as for leads; the desk asks for a parent when someone says they are under 18.

## 4. How it works

### 4.1 Vocabulary

- **Channel account**: the school's WhatsApp number as registered with Meta: `phone_number_id`, display number, access token (encrypted at rest), verify token, webhook secret. One per school.
- **Contact**: a WhatsApp phone number talking to the school; linked to a lead and, when matched by phone, to a student.
- **Thread**: the running conversation with one contact; holds messages, the assistant's state (open, handed_off, closed), and the lead/student links.
- **Knowledge entry**: a titled piece of school text ("Documents needed to enrol", "Prices", "Exam steps in Prishtina"), kept by the owner in admin. The public page facts are injected automatically.

### 4.2 Data (messaging module)

`channel_accounts` — `id, school_id, channel ('whatsapp'), external_id (phone_number_id), display_number, access_token_enc, verify_token, app_secret_enc, status (pending | active | disabled), version`.

`desk_threads` — `id, school_id, channel_account_id, contact_phone, contact_name, lead_id (nullable), student_id (nullable), state (assistant | handed_off | closed), handed_off_to_conversation_id (nullable, the staff chat), last_inbound_at, last_outbound_at, window_expires_at (last_inbound + 24 h), turns_this_month, version`.

`desk_messages` — `id, school_id, thread_id, direction (in | out), author (contact | assistant | staff), body, external_message_id (unique per account for inbound dedupe), tool_calls (jsonb, for assistant turns: which tools, with what, what came back), sent_at, delivery_status (queued | sent | delivered | read | failed)`.

`knowledge_entries` (school module) — `id, school_id, title, body (≤ 4000 chars), language, enabled, updated_by, version`.

`desk_usage_monthly` (messaging) — `school_id, month, conversations, assistant_turns, tokens_in, tokens_out` for billing; one conversation = one thread with at least one assistant reply in that month.

### 4.3 Flow

1. **Inbound**: `POST /v1/webhooks/whatsapp` (public, signature-verified with the app secret; `GET` answers Meta's verification challenge). The handler resolves the school via the definer function, upserts the thread by contact phone, stores the inbound `desk_messages` row (idempotent on `external_message_id`), and appends `DeskMessageReceived`. 200 fast.
2. **Assistant turn** (worker subscriber `messaging.desk-assistant`, serialised per thread with an advisory lock): if the thread is `handed_off`, forward the text into the staff conversation (`SendMessage` from a system user) and stop. Otherwise build the context: system prompt (role, rules, school name, language instruction), knowledge entries, public page facts, the last 20 messages; call the `Assistant` adapter with tools; store the reply and tool calls; send through the channel adapter; update usage.
3. **Tools the assistant may call** (each maps to an existing query or command, executed in the school scope with a system actor):
   - `get_free_slots(lessonTypeId?, from, to)` → scheduling `free-slots` query (read).
   - `find_student_by_phone()` → training query on the contact's phone (read; returns only "known student: first name" or nothing).
   - `book_first_lesson(start, instructorMembershipId, lessonTypeId)` → `BookLesson` for a known student with credits, or `CaptureLead` + a `leads.note` "wants to start on …" for an unknown person (no lesson is booked for someone without a student record and credits).
   - `capture_lead(fullName, licenceClass, message, isMinor)` → training `CaptureLead` with `source: 'whatsapp'` and the contact phone (dedupe rules apply).
   - `hand_off(reason)` → sets the thread `handed_off`, creates or reuses a staff conversation ("WhatsApp: +383…"), posts the transcript summary into it, notifies owners/office (`desk_handoff` template), replies to the contact that a person will follow up.
4. **Staff replies** in the admin inbox thread: messaging subscribes to `MessageSent` in a conversation linked to a `desk_thread` and sends the text out through the channel adapter; staff can "Give back to assistant" (thread → `assistant`) or "Close".
5. **Outbound delivery statuses** arrive on the same webhook and update `delivery_status`.
6. **Window**: outside the 24-hour window the channel adapter refuses free-form text; the desk then sends nothing and the staff inbox shows "waiting for the customer to write again".

### 4.4 Assistant behaviour rules (part of the system prompt, tested by fixture conversations)

- Reply in the contact's language; short messages; one question at a time.
- Facts only from the provided knowledge and tool results; when unsure, say so and offer to hand off.
- Never quote a price that is not in the public price list; never state legal/exam rules not in the knowledge base.
- Ask name and licence class early and capture the lead once both are known.
- Under 18: ask for a parent to continue; capture `isMinor: true` with the guardian contact.
- Hand off on: a request for a human, complaints, payment questions, anything the knowledge base does not cover after one clarifying question.

### 4.5 Adapters

`MessagingChannel`: `sendText(account, to, text) → { externalMessageId }`, `verifyWebhook(rawBody, headers, account) → InboundEvent[] | null`, `verifyChallenge(query) → string | null`. Implementations: `WhatsAppCloudChannel` (Graph API `/{phone_number_id}/messages`, HMAC-SHA256 `X-Hub-Signature-256`), `FakeChannel` (in-memory outbox used by tests and the dev "WhatsApp simulator" page in admin, see §4.7).

`Assistant`: `reply(input: { system, knowledge, messages, tools }) → { text, toolCalls, usage }`. Implementations: `ClaudeAssistant` (`@anthropic-ai/sdk`, tool runner with Zod tools, `strict: true`, streaming off for short replies, adaptive thinking effort low, `fallbacks: "default"`), `FakeAssistant` (scripted replies and tool calls for tests).

### 4.6 Billing and metering

`desk_usage_monthly` is incremented per assistant turn; the platform statement job adds a `PlatformChargeCreated` of kind `desk_overage` for conversations above the plan's included 300 at a per-conversation price stored on the plan (`plans.desk_included`, `plans.desk_overage_minor`). The add-on itself is a plan feature `whatsapp_desk`.

### 4.7 Admin and mobile

Admin: Settings → "WhatsApp desk" (connect the number: phone-number id, token, app secret, verify token; test send; status), Knowledge base (list, edit, enable/disable, language), Inbox shows desk threads with the assistant transcript, a "Take over" / "Give back" / "Close" bar, and the usage counter for the month. In dev and mock mode, a "WhatsApp simulator" page lets you type as a customer against the fake channel. Mobile: nothing new (staff use admin; the student app is unaffected).

## 5. Decisions taken (my calls, correct me)

- Opus 5.5 at low effort rather than a cheaper model: Albanian quality is the risk the report flags, and cost per turn is still cents. The model id is an env setting.
- Leads from WhatsApp use the existing leads table with `source: 'whatsapp'` (enum extended), so the funnel counts them.
- The desk books lessons only for known students with credits; for strangers it captures the lead and the preferred time. (Booking a lesson for someone with no record would need a student, consent and credits that do not exist yet.)
- Handoff goes into the existing staff chat so no second inbox is needed.
- Transcripts kept 12 months by default (school setting), then deleted by the retention job.

## 6. Left to the builder

Prompt wording (must satisfy §4.4 fixtures), Zod tool schemas, exact knowledge-entry editor UI, usage counter display, migration numbering.

## 7. Testing

Webhook: signature verification, challenge, idempotent inbound, unknown number → 404, school resolution via definer function (tested in `security-definer.test.ts`). Assistant subscriber with the fake assistant: a scripted conversation that captures a lead, books a lesson for a known student (clash → polite retry), hands off; per-thread serialisation; window expiry; handed-off forwarding both ways. Rules fixtures with the fake assistant: the subscriber refuses to send a reply containing a price not in the public list (post-check against the price list; such a reply is replaced by a handoff). Metering and overage charge. Admin component tests (settings, knowledge, inbox takeover) and a Playwright mock scenario using the simulator. One opt-in live test against the real model guarded by `ANTHROPIC_API_KEY` (skipped in CI).

## 8. Decisions from the builder check (my calls)

1. **The desk thread is the inbox.** Handed-off conversations stay in `desk_threads`/`desk_messages`; staff reply through a new `ReplyInDeskThread(actor, threadId, text)` command (permission `desk.reply`, owner/office), not through `conversations`. No change to the student chat tables, retention or mobile inbox. `hand_off` notifies owners/office (`desk_handoff` template) with a deep link to the thread in admin.
2. **One DriveOS Meta app, platform-wide.** The app secret and verify token live in env (`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`); the single webhook URL verifies the signature with the platform secret, then resolves the school from the payload's `phone_number_id` through the definer function `messaging_school_for_channel_account(channel, external_id)`. A school connects its own WhatsApp Business number under our app by entering the phone-number id and a system-user access token in settings (stored encrypted). Embedded signup can replace the manual entry later.
3. **Add-on billing:** `subscription_addons(id, school_id, addon ('whatsapp_desk'), started_at, ended_at)` managed by the platform admin; the monthly statement job adds `platform_charges` of kind `desk_addon` (the add-on price from `plans`-independent `addon_prices` config, default €29) and `desk_overage` per conversation above the included 300 (`DESK_INCLUDED_CONVERSATIONS`, `DESK_OVERAGE_MINOR` env defaults, overridable per addon row). The feature check is "has an active addon row".
4. **What the desk books:** only lessons for a known student who has enough credits, any active lesson type of kind `lesson`, from the free-slot query for the student's primary instructor (or any instructor when none is assigned). The phrase "first lesson" is dropped; the assistant offers "your next lesson". Strangers get a lead with `note` "wants to start on …".
5. **System actor:** `lessons.booked_via` gains `assistant`, `booked_by_membership_id` becomes nullable; `BookLesson` accepts an actor of kind `assistant` with no membership. No bot user or membership is created.
6. **Consent on WhatsApp:** the first reply to a new contact is a short privacy notice (i18n `desk.notice.v1`: automated assistant of the school, messages stored, processed by an AI provider, reply "OK" to continue, or ask for a person). Until the contact replies after the notice, the desk stores the inbound text (needed to answer) but captures no lead; if no reply follows within 24 h the thread is deleted. Continuing counts as consent with version `whatsapp-consent.v1` and the contact's locale stored on the lead. Minors: as the enrolment page (parent continues, `isMinor: true`). The legal wording is reviewed before launch (see "yours" list).
7. **Matching a known student by phone:** `users.phone` of a membership with role `student` → that student; a guardian's `users.phone` → their linked student(s) (the desk asks which child when several); `invitations.phone` with a `studentId` → "known, invitation pending" (the desk explains how to accept the invitation; no booking).
8. **Caps:** 40 assistant turns per thread per day and a monthly token cap per school (`DESK_MONTHLY_TOKEN_CAP`, default 2 million); beyond either, the desk hands off with a polite message. Inbound to a number without an active addon: stored, no reply, surfaced in the platform alerts.
9. **Retention:** desk transcripts follow the school's existing `chat_retention_months`; no second setting.
