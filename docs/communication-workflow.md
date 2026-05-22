# HARBLANC Freight Acquisition & Dispatch Communication Workflow

**Status:** Planning artifact. No code in this document. Operating spec for how a quote enters the business, how it gets answered, and how it converts into a dispatched load.

**Audience:** Brent (dispatcher / owner-operator). Single-operator reality. Phone-first day. Competing against brokers who answer in minutes and bigger carriers with back-office staff. The whole workflow has to work from a phone in a truck stop.

---

## 1. Headline Recommendation

Stop treating the website like a freight desk and start treating it like the **front door of a conversation**.

Replace the detailed quote form as the first interaction with a **Quick Quote** — five fields, mobile-first, sub-30-second submission. Within minutes the customer gets a real human-feeling acknowledgement from a named dispatcher with USDOT/MC visible. Within thirty minutes they get a **price range** (not a hard quote) and a phone number. Real conversation happens over phone or email. Only **after the customer says "let's go"** does the detailed freight intake happen, and only at the booking moment does the formal PDF quote get issued — and at that point it doubles as the rate confirmation.

The existing detailed form and PDF generator are not wasted. They get **repositioned** as the closing document, not the opening pitch. They live in admin, used by Brent at the moment a load is confirmed, not by the customer cold.

The whole workflow optimizes for one number: **response speed**. In freight, the carrier who responds first with a real human and a confident price usually wins, even at slightly higher rates. Everything below serves that.

---

## 2. The Mental Model Shift

A SaaS instinct says: build a complete intake form, validate every field, let the customer self-serve, send an automated price. That is wrong here for three reasons.

First, freight customers don't know their freight. A guy moving a skid-steer from Tulsa to Dallas knows the weight is "about 8,000 lbs" and the pickup is "sometime next week." He does not know freight class, NMFC code, declared value, accessorial codes, or appointment windows. Asking him to know that up front filters out 80% of legitimate leads.

Second, every load HARBLANC hauls — hotshot, expedited, equipment, oversized — has too many variables for instant pricing. Lane plus weight is not enough. Tarps, chains, permits, deadhead, fuel, season, return likelihood, multi-stop logistics, escort requirements — all of these move the rate by hundreds or thousands. Auto-quoting either locks HARBLANC into bad rates or scares customers off with high ones.

Third, the customers HARBLANC wants — the ones who become repeat freight — value **a real dispatcher who knows the lane**. They've been burned by brokers. The whole brand pitch is "no middlemen, no markups, no broker games." A robotic auto-responder undercuts that the moment it sends. The first email has to feel like Brent picked up.

So the workflow is built around **fast human response, not automation**. Automation supports Brent's ability to respond fast — it doesn't replace him.

---

## 3. Customer Journey (5 Stages)

**Stage 1 — Discovery.** Customer arrives at harblancservices.com from search, referral, or repeat. They see a real carrier (USDOT, MC visible, owner-operated, lane list). They scroll. They want to know: *can this guy move my thing, and how much.*

**Stage 2 — Lead capture (Quick Quote).** Five fields. Pickup ZIP, delivery ZIP, weight range or equipment description, target pickup date, name + phone + email. One free-text "what are we moving" field. Submit. Total time: under 60 seconds on a phone.

**Stage 3 — Acknowledgement (instant).** Auto-email goes out within seconds. Sent from `dispatch@harblancservices.com`, signed by Brent, with USDOT/MC in the footer. It says: *got it, dispatch is on it, you'll hear from a real person within an hour, here's my direct line if it's urgent.* This is the only fully automated message in the workflow and its job is to **prevent the customer from immediately contacting three other carriers**.

**Stage 4 — Engagement (manual, within 30 min target, 2 hr ceiling).** Brent reviews the lead in admin on his phone. He sends a personal reply with a **price range** ("$1,800–$2,200 for this lane depending on accessorials, can usually do it in your window"), confirms equipment availability, and ends with a question that forces engagement ("what time does it need to deliver?" / "is there a forklift on the receiving end?" / "what's the longest dimension?"). Or he calls. Phone close rate on warm leads is dramatically higher than email — when the lead looks real and reachable, Brent calls.

**Stage 5 — Conversion & dispatch.** Once the customer commits ("yeah let's book it"), the detailed intake happens — either over phone with Brent filling the admin form, or via a follow-up email asking for the specific details still needed (dimensions, exact addresses, contact at pickup/delivery, COI requirements, etc.). Formal PDF quote / rate confirmation gets generated and emailed at this moment. Customer signs/replies acknowledging. Load goes on the schedule. Dispatch executes. POD comes back. Invoice goes out.

The website is responsible for Stage 1, 2, 3 only. Stages 4 and 5 are admin + email + phone, with the PDF system as the closing artifact.

---

## 4. The Funnel Architecture

Three distinct documents/flows that the system needs to support. They are not the same thing and conflating them is what got us tangled up.

**Quick Quote (public, front door).** Lives at `/quote`. Five fields. Replaces the current detailed form on the public site. Job: capture a lead with enough info to start a conversation. Not enough info to price. Not a freight document. Just an inbound ticket.

**Detailed Freight Intake (admin, internal).** Lives inside the admin quote detail page. Brent fills this in (or fills it in over the phone with the customer) once engagement is real. This is the current detailed form, **repositioned**. It captures everything the PDF needs: exact addresses, dimensions, accessorials, payment terms, special instructions. It exists to feed the PDF generator and to be the operational source of truth for the load.

**Formal Quote / Rate Confirmation (PDF).** Generated at the moment Brent confirms the load with the customer. The same `@react-pdf/renderer` system already built — it's just timed differently. Sent as an attachment to the booking-confirmation email, doubles as the rate confirmation, and later becomes the BOL source. Phase 1 already built this; the change is *when* it fires, not *whether* it exists.

The mistake we were drifting toward: making the customer fill out the Detailed Intake on the public site. Customers shouldn't see the detailed intake. They see Quick Quote, then they see the formal PDF when they're ready to book.

---

## 5. Email Sequence Map

Every email the system needs to support, in order of typical occurrence. The "Sent by" column is the operational reality, not the implementation — automated emails still appear to come from Brent personally.

| # | Trigger | Email | From | Subject (sample) | Automation | Purpose |
|---|---|---|---|---|---|---|
| 1 | Quick Quote submitted | Lead acknowledged | Brent | "Got your freight request — HS-{tail of submission ID}" | **Auto, instant** | Lock the lead. Prevent shopping. Set expectations. |
| 2 | Internal | Dispatch alert | System → Brent's phone/email | "New quote: Tulsa → Dallas, skidsteer, 8000 lb" | **Auto, instant** | Wake Brent up. Push notification. |
| 3 | Brent reviews & replies | Price range / engagement | Brent | "Re: your Tulsa → Dallas move" | **Manual** | Open the conversation. Hand them a range. Ask a question. |
| 4 | No response after 24h | Soft follow-up | Brent | "Still need that {commodity} moved?" | **Semi-auto** (drafted by system, sent by Brent with one tap) | Recover dormant leads. |
| 5 | No response after 72h | Final follow-up | Brent | "Closing out the file unless I hear back" | **Semi-auto** | Last touch before archive. |
| 6 | Customer says "let's book" | Detailed intake request | Brent | "Few last things to lock this in — pickup contact, exact addresses" | **Manual** (or skipped if collected by phone) | Collect what the PDF needs. |
| 7 | Brent generates formal quote | Booking confirmation + PDF | Brent | "Quote HS-2026-0042 — Tulsa → Dallas — confirmed for {date}" | **Manual** (Brent triggers from admin) | Formal commitment. PDF attached. Reply-to-accept. |
| 8 | Day before pickup | Pre-pickup reminder | Brent | "Tomorrow's pickup — confirming details" | **Manual or semi-auto** | Trust signal. Logistics check. |
| 9 | Load delivered | POD / delivery confirmation | Brent | "Delivered — POD attached" | **Manual** | Closes the cycle. Sets up invoice. |
| 10 | Invoice cycle | Invoice | Brent | "Invoice HS-INV-0042 — Net {terms}" | **Manual or semi-auto** | Money. Separate cadence. |
| 11 | 7 days after quote, no booking | Quote expired | Brent | "Quote HS-2026-0042 expired — still want to move it?" | **Auto** | Recycle the lead. Optional re-engagement. |

**Notes on automation choices:**

The acknowledgement (#1) is automated because the cost of waiting is high and the message is generic. Everything else is human or human-triggered, because freight is a relationship business and the second email is where trust is built or lost.

#4 and #5 are "semi-auto": the system drafts the body using the lead's known fields, queues it in admin, and Brent reviews and one-taps send. This is the right balance — Brent doesn't type from scratch, but the customer never gets a tone-deaf robot.

#7 (booking confirmation + PDF) is **never** automated. Brent has to click generate-and-send. This is the moment of commercial commitment; it should never go out accidentally because a status field flipped.

#11 (quote expired) is auto because it's low-stakes and the customer expects it. Optional — could be turned off entirely if it feels too corporate.

---

## 6. Automation vs Human-Touch Breakdown

**Fully automated (no Brent involvement):**
- Lead acknowledgement to customer (#1)
- Internal dispatch alert to Brent (#2)
- Quote-expired re-engagement (#11)

**Semi-automated (system drafts, Brent reviews + sends):**
- 24-hour soft follow-up (#4)
- 72-hour final follow-up (#5)
- Pre-pickup reminder (#8) — depending on Brent's preference
- Invoice (#10) — generated from the load, but Brent decides when to send

**Fully manual (Brent writes / phone call):**
- Initial price-range reply (#3) — the most important email in the entire workflow
- Detailed intake collection (#6) — usually phone, not email
- Booking confirmation + PDF attachment (#7)
- POD / delivery confirmation (#9)

The principle: **automate the low-stakes / high-volume touchpoints** (acknowledgement, follow-up nudges, expiration). **Keep the high-stakes touchpoints human** (first real reply, booking, delivery confirmation). Automation is there to free Brent up for the calls that close, not to replace him in the conversations that matter.

---

## 7. Recommended Website Quote-Flow Structure

The `/quote` page becomes radically simpler. Above the fold, on a phone:

- One-line pitch: *"Direct dispatch. Honest pricing. Reply within the hour."*
- Five fields, vertically stacked, large tap targets:
  - **Pickup ZIP** (number pad on mobile)
  - **Delivery ZIP** (number pad)
  - **What are we moving?** (free text — one line)
  - **Approximate weight** (free text — accepts "8000 lbs" or "about 4 tons")
  - **When does it need to move?** (date or "ASAP")
  - **Your name + phone + email** (three fields, grouped)
- One CTA button: *"Request a quote"*
- USDOT 3918509 / MC 1467901 visible underneath as authority signal
- Phone number as alternate CTA: *"Or call dispatch directly: (XXX) XXX-XXXX"*

That's it. No equipment-type dropdown (free-text "what are we moving" handles it — Brent infers). No accessorials. No appointment windows. No commodity class. No carrier preference. None of that exists at this stage.

A second sentence under the form: *"This is a request, not a binding order. We'll reply with a price range within the hour."* This single sentence solves two problems: it tells the customer the form is low-commitment, and it tells them they won't be auto-quoted (which they'd distrust anyway for non-LTL freight).

**One concession to detail:** consider adding an optional second screen *after* submit — a "while you're here, anything else we should know?" free-text textarea with examples ("dimensions, special handling, deadlines"). This catches the 20% of customers who do know more, without forcing the 80% to deal with it.

---

## 8. Recommended Admin Workflow

Brent's day, from his phone:

1. **Push notification** lands: new quote, lane summary, estimated rough revenue.
2. He opens admin → sees Quick Quote with the five fields filled in. Two-tap actions visible:
   - **Reply with range** (opens email composer pre-populated with the customer fields + a calculated rough range based on lane + weight + equipment guess)
   - **Call now** (tel: link to customer phone)
   - **Mark not-a-fit** (politely declines via templated email)
3. If he replies with range, the system tracks reply time (operational KPI: median time-to-first-response).
4. The lead's status moves from `new` → `engaged`. If the customer replies, status moves to `negotiating`. If no reply in 24h, the semi-auto follow-up gets queued for Brent to review.
5. Once the customer says yes, Brent opens the detailed intake (the current detailed form, now scoped to admin-only) and fills in what he learned on the call. Status moves to `booking`.
6. He generates the PDF. The "Send quote" button (currently disabled / coming-soon) becomes the action that emails the PDF as the booking confirmation. Status moves to `confirmed`.
7. Day-before, day-of, and post-delivery touches are checklist items in admin, not a complicated state machine. A scheduled task can surface "pickups tomorrow" each evening if useful.

The admin shouldn't become a CRM. It's a triage list and an action surface. Most days Brent will be working three or four active threads — the UI should make those three or four threads obvious and the actions on them one-tap.

---

## 9. PDF Timing

The existing PDF system fires at **Stage 5, not Stage 1**. Specifically: when Brent clicks "Confirm booking & send quote" from admin after the customer has verbally or in-writing committed.

The PDF at that moment serves three functions:

1. **Formal quote** the customer can keep / share with their AP department.
2. **Rate confirmation** — both parties have a written document with the agreed rate, dates, addresses, accessorials, and terms.
3. **Source document for the BOL** — when the load executes, the BOL gets generated from the same data with delivery-specific fields filled in.

This means the PDF template should evolve in Phase 2 to support a "status" or "document type" mode: *Quote*, *Rate Confirmation*, *BOL*, *Invoice* are all the same underlying load record with different rendered outputs. That's a Phase 2/3 concern; for now the Phase 1 PDF (which we just built) is the Quote variant.

**One useful addition** for Phase 2: a *quote acceptance* mechanism that's lighter than a full e-signature flow. Could be as simple as the booking-confirmation email saying "reply YES to confirm" and Brent updating status manually based on the reply. Heavier acceptance (linked acceptance page with signature capture) is a later concern — most owner-op freight is closed on phone + email reply, not portal signatures.

---

## 10. Payment Timing

Three customer profiles, three payment profiles:

**Established repeat customer.** Net 30, invoice goes out after POD, terms agreed once and reused. This is the goal. Most of HARBLANC's revenue should live here over time.

**New customer, low-risk load.** Net 7 or Net 15. Invoice after POD. Optional CC hold or partial deposit if the load is high-value relative to the relationship.

**New customer, high-value or equipment haul.** Deposit (25–50%) before pickup, balance on delivery or Net 7 after POD. Equipment hauling especially — chains, tarps, escort costs, return deadhead all create exposure if a customer backs out at pickup.

**Do not collect payment through the website.** Not at the Quick Quote stage, not at the booking stage. Reasons:

- Locks HARBLANC into a CC processor relationship and chargeback exposure for freight, which is a high-dispute industry
- Slows down booking (customer needs to find a card, enter it, finish)
- Removes flexibility on terms (some customers will fund a deposit by ACH, some by check, some by CC — manual invoicing keeps all of that available)
- Sends the wrong signal — the brand pitch is "direct dispatch, no middlemen" and a checkout flow makes it feel like an e-commerce experience

Manual invoicing through a separate tool (QuickBooks, Wave, or even just a PDF invoice with ACH instructions in the email body) is the right answer for the first year. Revisit when volume justifies it.

---

## 11. Conversion Strategy

Five levers, in priority order:

1. **Response speed.** Under 30 minutes from Quick Quote submission to a real reply from Brent. This single number drives more revenue than any other UX optimization. Internal alert system (#2) has to be loud — push notification, SMS to Brent's phone, email — so even from a truck stop he sees it within minutes.

2. **Named human in every reply.** "Brent Harblanc, Dispatch" with the USDOT/MC in the footer of every email. Customers comparing carriers see five "Dispatch Team" replies and one with a real name — the real name wins.

3. **Range pricing, not silence.** A range that says "$1,800–$2,200 depending on tarps and deadhead" tells the customer two things: HARBLANC knows the lane, and the rate is roughly competitive. Silence (or "we'll call you tomorrow") loses leads to whoever quoted a number, even if that number is wrong.

4. **One forcing question per reply.** Every customer-facing email should end with a question the customer has to answer to move forward. Not "let me know if you have questions" but "what time does it need to deliver?" or "is there a forklift at the receiving end?" — engagement-forcing language. Email threads die without forcing questions.

5. **Phone for warm leads, email for everything else.** If the lead looks legitimate (real-sounding company, sane lane, reachable phone number), Brent calls within the hour. Email is the fallback for after-hours and for written-trail moments (booking confirmation, POD, invoice). The mistake is using email when phone would close — and using phone when email would document.

---

## 12. Trust-Building Strategy

Customers trust freight carriers based on signals, not claims. Signals HARBLANC should be pushing:

- **USDOT 3918509 / MC 1467901** visible everywhere — site footer, email signature, PDF header, invoice header.
- **Owner-operated** stated explicitly. Customers burned by brokers respond to this. Don't be coy about it.
- **Lane-specific knowledge** in the first email. "I usually run that lane Tuesday/Thursday" — even one specific detail destroys the "this guy is just shopping me out to other drivers" suspicion.
- **Consistent named sender.** Brent. Every email. No "team@" or "support@" — `dispatch@harblancservices.com` from a person, not a department.
- **Quick second touch.** Customers expect to be ignored or upsold. A pre-pickup reminder the day before — even just "all set for 8 AM tomorrow at the Tulsa yard" — is wildly disproportionately powerful as a trust signal at low cost.
- **POD turnaround.** Sending the POD same-day after delivery is a small thing that converts first-time customers into repeats more than almost anything else.
- **No surprise charges.** If accessorials change between quote and execution, communicate before, not after. Customers forgive surprises that come with a phone call; they don't forgive surprises on the invoice.

What to avoid:

- Stock photography of trucks that aren't yours
- "Award-winning" or "best-in-class" language — operators don't talk that way
- Multi-page Terms & Conditions on the public quote form — the carrier-customer agreement lives in the rate confirmation, not the website
- Anything that smells like a broker pretending to be a carrier

---

## 13. Mobile-First Communication

Both ends of every conversation are on a phone. Brent in a truck; customer at a job site. Implications:

- **Email rendering** must be plain enough to read in a thumb-scrollable inbox. No HTML banners, no embedded marketing graphics, no "view in browser" links. The PDF is the only formatted artifact; the email body is plain text with one signature block.
- **PDF rendering** must read on a phone screen, not just printed letter-size. Phase 1's PDF is already designed for this — Letter format but typographically clear at 320px width. Worth re-checking on Brent's phone when reviewing.
- **Forms** on the public site must use the right `inputmode` so phones bring up the right keyboard (number pad for ZIPs, email keyboard for email, etc.).
- **Phone numbers as `tel:` links** everywhere — site footer, every email signature, the customer's phone in admin (so Brent one-taps to call from the lead).
- **SMS as a backup channel.** Not a primary one, but worth supporting at the booking-confirmation moment — "I just emailed the rate confirmation, let me know if you don't see it." Could be manual via Brent's phone for now; productized later only if volume justifies.

---

## 14. Biggest Mistakes to Avoid

1. **Making the customer fill the detailed intake form.** This is what we were drifting toward. It filters out 80% of legitimate leads, sets the wrong tone, and gives Brent information he doesn't need at lead stage.

2. **Auto-generating a hard price.** Pricing freight without seeing the load is how brokers operate, and it's how carriers eat losses on accessorials they didn't quote for. Range pricing in a human reply is the right play.

3. **"Dispatch Team" as the sender.** Erases the entire brand promise. Always Brent (or a named successor).

4. **Slow first response.** Anything over an hour collapses conversion. The acknowledgement email buys ~30 minutes of patience; the first real reply has to land inside that window.

5. **Charging through the website.** Adds friction at booking, exposes HARBLANC to chargebacks, locks in a processor relationship before volume justifies it.

6. **Multi-day silence between booking and pickup.** Even one short "all set for tomorrow" email three days out prevents 80% of pre-pickup cancellations.

7. **PDF sent before commitment.** Sending a formal quote PDF to a Quick Quote lead before they've engaged makes the carrier look desperate and makes the PDF lose meaning. The PDF earns its weight as the booking artifact.

8. **Over-automating follow-ups.** A daily auto-nudge to dormant leads burns the goodwill of the acknowledgement email. Two follow-ups, both Brent-reviewed, both with a forcing question, then archive.

9. **Building a customer portal in Phase 1.** Customers in freight don't log in to portals. They want an email reply with a PDF attached and a phone number. Portal energy is a Phase 3+ thing if at all.

10. **Conflating quote / rate confirmation / BOL / invoice.** They share data but they're four distinct documents with four distinct moments. The Phase 1 PDF is the Quote variant; Phase 2 will need to evolve the same generator to support the others.

---

## 15. What This Means for the Existing Phase 1 Work

Nothing built so far is wasted. The repositioning:

- **`quote_requests` table:** Currently captures the full detailed intake from the public form. **Will become** the Quick Quote inbox — schema can stay, most fields just become optional and unused at the public-form stage. The fields get filled in later by Brent in admin during the engagement stage.

- **Detailed quote form (current public `/quote`):** **Gets replaced** on the public site by the five-field Quick Quote. **Moves** to admin as the detailed intake panel Brent fills in after engagement. Same component, different placement, different timing.

- **`generated_quotes` table + PDF generator:** **Stays exactly as-is**. Just fires later in the workflow — at booking confirmation, not at lead capture. The "Send quote" button in admin (currently disabled) becomes the booking-confirmation action.

- **Admin quote detail page:** Already structured around tabs (Request, Generated Quote). Add a third tab or activity log to show the email thread / call notes so Brent has the full thread on one screen.

- **Email infrastructure (Resend):** Currently paused. Becomes the next phase. First email to ship is the lead acknowledgement (#1) — fully automated, lowest risk, highest immediate value.

---

## 16. Phased Build Order (recommended)

If we agree on this workflow, the build order is:

1. **Phase 2A — Public Quick Quote.** Replace the current detailed `/quote` form with the five-field version. Keep the existing detailed form alive in admin only. ~1 day of work, no DB schema change required (just makes most fields optional and unused publicly).

2. **Phase 2B — Email infrastructure + acknowledgement email (#1).** Wire up Resend with the verified domain. Ship the lead-acknowledgement auto-email and the internal dispatch alert (#2). Test deliverability rigorously.

3. **Phase 2C — Reply composer in admin.** The "Reply with range" two-tap action from the admin quote detail. Plain-text email, pre-populated with customer fields and a stub price range. Send via Resend, append to thread log.

4. **Phase 2D — Booking confirmation flow.** Re-enable the "Send quote" button on the generated-quote tab. Sends the PDF as an attachment with a templated booking-confirmation email body. Marks the load as confirmed.

5. **Phase 2E — Follow-ups + expiration.** The semi-auto 24h/72h nudges and the auto-expiration email. Lowest priority; ship after the above is real.

6. **Phase 3+** — pre-pickup reminders, POD delivery, invoice, then later: BOL generation, status portal, signature capture, payment integration, repeat-customer dashboards.

---

## 17. Open Questions for You

Before any code gets written on Phase 2:

1. **Quick Quote scope.** Are we agreed on five fields, or do you want six (e.g., explicit equipment type dropdown vs free-text inference)?
2. **Phone in signature.** The current `company.ts` has `dispatchPhone: "(XXX) XXX-XXXX"` as placeholder. Need the real number before any email ships — it's in the signature of every auto-email.
3. **After-hours acknowledgement.** Should the auto-acknowledgement be different if it's sent at 11 PM ("I'll get back to you first thing in the morning") vs business hours ("you'll hear back within the hour")? Cheap to add, worth it.
4. **Range pricing source.** When Brent clicks "Reply with range" — do we want the system to compute a *rough* range from a lane-distance × weight × equipment-multiplier table, or do we want it to open a blank composer and let Brent type the range himself? Computed-range is faster but risks anchoring Brent on a bad number; blank composer is slower but always correct.
5. **Quote expiry default.** Currently 7 days in the Phase 1 form. Is that right for HARBLANC's lanes, or should it be 3 / 5 / 14? Affects re-engagement timing.
6. **Phone vs email priority.** When a Quick Quote comes in, should admin nudge Brent toward *calling* (loud phone button) or *emailing* (loud reply button)? My recommendation: phone for the warm-looking ones, email default for everything else — but worth your read.

Answer these and Phase 2A becomes a one-day build.
