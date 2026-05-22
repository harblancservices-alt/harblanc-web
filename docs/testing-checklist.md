# HARBLANC End-to-End Testing Checklist

**Audience:** Brent. This is the manual lifecycle test — run it against a throwaway lead before any meaningful production deploy.

The system has five document classes and a 13-state pipeline now. The combinatorial space is too big to test exhaustively; this checklist hits the common paths plus the edge cases that have historically broken.

---

## 0. Setup

- [ ] Start dev server: `npm run dev`
- [ ] Open two windows:
  - Customer window (incognito): `http://localhost:3000/quote`
  - Admin window: `http://localhost:3000/admin/login`
- [ ] Use a real email you control (Brent's personal Gmail is fine — Resend will deliver to it)
- [ ] Use fake names like "Test Customer Q4" so they're easy to spot and delete later

---

## 1. Happy path — single shipment all the way through

### Quick Quote

- [ ] Submit the Quick Quote form on the public site
- [ ] Land on `/quote/success`
- [ ] Acknowledgement email arrives within seconds
- [ ] Internal dispatch alert arrives
- [ ] Admin dashboard shows lead under "New" with "New lead" label
- [ ] Activity tab shows `lead_received`, `ack_sent`, `dispatch_alert_sent`

### Range Proposal

- [ ] Open the lead in admin
- [ ] Workspace tab: fill the Quick Estimate composer (rate, miles, pickup notes)
- [ ] Click Build Preview — preview iframe renders the email
- [ ] Click Send — confirmation modal accepts
- [ ] Customer gets the estimate email
- [ ] Estimate appears in "Sent estimates" history with the persisted preview byte-identical to what was sent
- [ ] Status auto-advances to `estimate_sent`
- [ ] Activity: `estimate_draft_saved`, `estimate_sent`, `status_changed`

### Shipment intake

- [ ] In customer email, click "Accept quote"
- [ ] Fill the intake form (pickup/delivery addresses, dimensions, weight)
- [ ] Click "Save progress" first — confirm form shows the saved-progress notice; refresh; data still there
- [ ] Click "Submit for dispatch review"
- [ ] See "Shipment details received" success screen

**Verify in admin:**
- [ ] Status auto-advanced to `Awaiting confirmation`
- [ ] Workspace tab now shows the **Submitted Intake** panel above the estimate composer
- [ ] Submitted Intake panel shows: pickup + delivery addresses, contacts, windows, commodity, dimensions, exact weight, loading/unloading labels, any operational red-flag chips (Forklift / Hand load / etc.)
- [ ] Activity tab: `estimate_accepted` (mode=submit) + `intake_submitted` + `status_changed`

### Finalized Quote / Rate Confirmation

- [ ] Open the **Finalized Quote** tab
- [ ] Confirm the Submitted Intake panel shows there too
- [ ] Click "Generate finalized quote"
- [ ] Form prefills from intake — verify pickup, delivery, commodity, dimensions, weight match
- [ ] Set exact pricing: linehaul, fuel surcharge, permits, one or two accessorials
- [ ] Live total at the bottom matches your math
- [ ] Click Build Preview — finalized quote email renders with all sections (shipment info, pickup, delivery, freight, ops requirements, rate band, policies, payment, confirmation)
- [ ] Click Send Finalized Quote — confirmation modal accepts
- [ ] Customer receives the rate confirmation email
- [ ] "Sent finalized quotes" history shows the record; View opens the iframe with the byte-identical snapshot
- [ ] Manually advance the lead to `Booked` then `Awaiting payment` then `Ready to dispatch` using the status selector (in real ops this happens once payment lands)

### Bill of Lading

- [ ] Open the **BOL** tab
- [ ] Click "Generate BOL"
- [ ] Form prefills from finalized quote (shipper, consignee, freight)
- [ ] Set NMFC / freight class / hazmat flag / dispatch notes
- [ ] Toggle a few operational checkboxes
- [ ] Click Build Preview — utilitarian transport-paperwork layout renders (heavy borders, freight grid, signature blocks)
- [ ] Click Send BOL — confirmation modal accepts
- [ ] Customer receives the BOL email
- [ ] Activity: `bol_draft_started`, `bol_draft_saved`, `bol_preview_built`, `bol_sent`

### Execution states

- [ ] Use the status selector to walk: `Dispatched` → `Picked up` → `In transit` → `Delivered`
- [ ] Confirm each transition logs a `status_changed` event
- [ ] Confirm the lead drops off the "Active funnel" Delivered bucket only after `Archived`

---

## 2. Edge cases

### Multiple estimates per lead

- [ ] Send an estimate to a lead
- [ ] After it's sent, send a second estimate (the form should empty out for a new draft)
- [ ] "Sent estimates" history shows both, newest first
- [ ] Each can be viewed in the iframe

### Re-issued finalized quotes

- [ ] After sending a finalized quote, click "Generate finalized quote" again
- [ ] A new draft starts — the partial unique index allows one open draft per estimate
- [ ] Edit pricing, send, confirm two records in the history

### Multiple BOLs (re-issued)

- [ ] Same pattern — after sending a BOL, generate a new one
- [ ] Verify the new BOL has a fresh `BOL-YYYY-NNNN` number

### Abandoned intake

- [ ] On a new lead, send an estimate
- [ ] Click Accept in the customer email, fill 2-3 fields, click "Save progress", then close the tab without submitting
- [ ] After 12+ hours (or fast-forward by editing `shipment_intake.created_at` in the DB), confirm an "Intake idle" urgency chip appears on the ops home

### Stale estimate

- [ ] Send an estimate
- [ ] Wait 24+ hours (or backdate `dispatch_estimates.sent_at`)
- [ ] Ops home shows the lead under "Needs attention" with "Estimate Nh no response" chip

### Invalid / expired token

- [ ] In the customer email, manipulate the accept URL — change a character in the token
- [ ] Visit the bad link
- [ ] Page renders a "link isn't valid" message, NOT a stack trace or 500

### Declined estimate

- [ ] On a fresh lead, click "Decline quote" in the customer email
- [ ] Optionally add a reason
- [ ] Confirm `estimate_declined` event logs
- [ ] Subsequent Accept link clicks should still gracefully refuse

### Stale preview

- [ ] In the finalized quote composer, build a preview
- [ ] Edit any field — the amber "Preview is stale" banner should appear, Send button disables
- [ ] Rebuild the preview — banner clears, Send re-enables

### Deleted quote restore

- [ ] Move a lead to trash from the quote detail
- [ ] Confirm it's gone from `/admin/quotes` and from the ops home
- [ ] Open `/admin/quotes/trash`, restore the lead
- [ ] Confirm it reappears in the active funnel with status preserved

### Cascade delete

- [ ] Move a lead with full history (estimate sent, FQ sent, BOL sent) to trash
- [ ] In the trash view, click "Permanently delete"
- [ ] In the Supabase SQL editor, confirm:
  - `dispatch_estimates` rows for that lead → gone
  - `shipment_intake` rows → gone
  - `finalized_quotes` rows → gone
  - `bills_of_lading` rows → gone
  - `dispatch_events` rows → gone

### Honeypot bot detection

- [ ] In the dev tools console on `/quote`, set the hidden `#website` input's value to `"http://bot.example.com"`
- [ ] Submit the form
- [ ] Expect a generic 400 "Could not save your request" — NOT a stack trace
- [ ] The server console logs `[quote] honeypot tripped`

### Too-fast submit

- [ ] In the dev tools console, run `document.querySelector('form').requestSubmit()` immediately after the page loads (faster than 2s)
- [ ] Expect a generic 400
- [ ] Server console logs `[quote] submit too fast`

### Env validation

- [ ] Stop the dev server, remove `RESEND_API_KEY` from `.env.local`, restart
- [ ] Admin dashboard shows the amber "System check" banner with a row about Resend
- [ ] Restore the var, confirm the banner disappears on next page load

---

## 3. After every meaningful change

- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean
- [ ] Run section 1 of this checklist against a fresh throwaway lead
- [ ] Spot-check the edge cases that are relevant to whatever you changed
- [ ] Document any friction in the commit message — small papercuts compound

---

## 4. Reporting friction

When something feels wrong in operations:

1. Note the lead ID, the action you took, and what you expected
2. Check the Activity timeline — did the event log capture what happened?
3. Check the Vercel logs if production, the terminal if local
4. Capture a screenshot before you start poking
5. Don't fix in production without a corresponding local repro
