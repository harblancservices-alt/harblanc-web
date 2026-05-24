"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateQuote } from "../actions";

type Defaults = {
  quoteRequestId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  commodity: string;
  weight: string; // free text from request, e.g. "12,000 lbs"
  // Phase 2A: Quick Quote lane + pickup target prefill (nullable —
  // older rows captured before the Quick Quote launch lack these).
  pickupZip: string | null;
  deliveryZip: string | null;
  pickupDate: string | null;
};

type Accessorial = { id: string; label: string; amount: string };

const inputCls =
  "block w-full bg-white border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-red-600 focus:outline-none";
const labelCls =
  "block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase";

function newAccessorialId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function parseWeightLbs(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits;
}

function defaultExpiresAt(): string {
  // Default: 7 days from now, in YYYY-MM-DD format for <input type="date">
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

export function GenerateQuoteForm({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState(defaults.customerName);
  const [customerContact, setCustomerContact] = useState("");
  const [customerEmail, setCustomerEmail] = useState(defaults.customerEmail);
  const [customerPhone, setCustomerPhone] = useState(defaults.customerPhone);

  // Lane prefills from the public Quick Quote (ZIPs) when present.
  // Brent will usually expand "74104" → "Tulsa, OK 74104" before
  // generating, so we seed with the ZIP and let him edit in place.
  const [origin, setOrigin] = useState(defaults.pickupZip ?? "");
  const [destination, setDestination] = useState(defaults.deliveryZip ?? "");
  const [pickupWindow, setPickupWindow] = useState(defaults.pickupDate ?? "");
  const [deliveryWindow, setDeliveryWindow] = useState("");

  const [commodity, setCommodity] = useState(defaults.commodity);
  const [weightLbs, setWeightLbs] = useState(parseWeightLbs(defaults.weight));
  const [pieces, setPieces] = useState("");
  const [equipmentType, setEquipmentType] = useState("");

  const [linehaul, setLinehaul] = useState("");
  const [fuelSurcharge, setFuelSurcharge] = useState("");
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);

  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [specialInstructions, setSpecialInstructions] = useState("");

  function addAccessorial() {
    setAccessorials((prev) => [
      ...prev,
      { id: newAccessorialId(), label: "", amount: "" },
    ]);
  }

  function removeAccessorial(id: string) {
    setAccessorials((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAccessorial(id: string, patch: Partial<Accessorial>) {
    setAccessorials((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function previewTotal(): number {
    const lh = Number(linehaul) || 0;
    const fs = Number(fuelSurcharge) || 0;
    const accTotal = accessorials.reduce(
      (sum, a) => sum + (Number(a.amount) || 0),
      0,
    );
    return lh + fs + accTotal;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("quote_request_id", defaults.quoteRequestId);
    formData.append("customer_name", customerName);
    formData.append("customer_contact", customerContact);
    formData.append("customer_email", customerEmail);
    formData.append("customer_phone", customerPhone);
    formData.append("origin", origin);
    formData.append("destination", destination);
    formData.append("pickup_window", pickupWindow);
    formData.append("delivery_window", deliveryWindow);
    formData.append("commodity", commodity);
    formData.append("weight_lbs", weightLbs);
    formData.append("pieces", pieces);
    formData.append("equipment_type", equipmentType);
    formData.append("linehaul", linehaul);
    formData.append("fuel_surcharge", fuelSurcharge);
    formData.append("expires_at", expiresAt);
    formData.append("payment_terms", paymentTerms);
    formData.append("special_instructions", specialInstructions);
    accessorials.forEach((a) => {
      if (a.label.trim() && a.amount.trim()) {
        formData.append("accessorial_label", a.label.trim());
        formData.append("accessorial_amount", a.amount.trim());
      }
    });

    startTransition(async () => {
      try {
        await generateQuote(formData);
        router.refresh();
      } catch (err) {
        // Phase INSTR: classify common server-action failure shapes so
        // the operator sees something actionable instead of a single
        // generic line. Behavior unchanged — the form still shows the
        // existing error box and stays put. NEXT_REDIRECT thrown by
        // requireAdmin() is intercepted by Next inside the
        // startTransition wrapper; we surface a session-expired hint.
        // In production, Next sanitizes thrown messages to a generic
        // string; we surface a “check Vercel logs” hint in that case.
        const msg = err instanceof Error ? err.message : String(err);
        const digest = (err as { digest?: unknown } | undefined)?.digest;
        const digestStr = typeof digest === "string" ? digest : "";
        if (digestStr.startsWith("NEXT_REDIRECT")) {
          setError(
            "Session expired — please log in again, then retry.",
          );
        } else if (
          /An error occurred in the Server Components render/.test(msg) ||
          msg === "" ||
          msg === "An unexpected response was received from the server."
        ) {
          setError(
            "Could not generate quote. The server logged a stage-tagged " +
              "error — check Vercel logs for `[generateQuote] stage=...`.",
          );
        } else {
          setError(msg || "Could not generate quote.");
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Customer */}
      <Section title="Customer">
        <Grid>
          <Field label="Customer name">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Contact (optional)">
            <input
              type="text"
              value={customerContact}
              onChange={(e) => setCustomerContact(e.target.value)}
              className={inputCls}
              placeholder="Buyer, logistics rep, etc."
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className={inputCls}
            />
          </Field>
        </Grid>
      </Section>

      {/* Lane */}
      <Section title="Lane">
        <Grid>
          <Field label="Origin" required>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className={inputCls}
              placeholder="Houston, TX"
              required
            />
          </Field>
          <Field label="Destination" required>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className={inputCls}
              placeholder="Dallas, TX"
              required
            />
          </Field>
          <Field label="Pickup window">
            <input
              type="text"
              value={pickupWindow}
              onChange={(e) => setPickupWindow(e.target.value)}
              className={inputCls}
              placeholder="2026-05-24 · 8am-12pm"
            />
          </Field>
          <Field label="Delivery window">
            <input
              type="text"
              value={deliveryWindow}
              onChange={(e) => setDeliveryWindow(e.target.value)}
              className={inputCls}
              placeholder="2026-05-25 · by 5pm"
            />
          </Field>
        </Grid>
      </Section>

      {/* Shipment */}
      <Section title="Shipment">
        <Grid>
          <Field label="Commodity">
            <input
              type="text"
              value={commodity}
              onChange={(e) => setCommodity(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Weight (lbs)">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={weightLbs}
              onChange={(e) => setWeightLbs(e.target.value)}
              className={inputCls}
              placeholder="12000"
            />
          </Field>
          <Field label="Pieces">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={pieces}
              onChange={(e) => setPieces(e.target.value)}
              className={inputCls}
              placeholder="optional"
            />
          </Field>
          <Field label="Equipment">
            <input
              type="text"
              value={equipmentType}
              onChange={(e) => setEquipmentType(e.target.value)}
              className={inputCls}
              placeholder="Flatbed / Gooseneck / Lowboy"
            />
          </Field>
        </Grid>
      </Section>

      {/* Pricing */}
      <Section title="Pricing">
        <Grid>
          <Field label="Linehaul (USD)" required>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={linehaul}
              onChange={(e) => setLinehaul(e.target.value)}
              className={inputCls}
              placeholder="1850.00"
              required
            />
          </Field>
          <Field label="Fuel surcharge (USD)">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fuelSurcharge}
              onChange={(e) => setFuelSurcharge(e.target.value)}
              className={inputCls}
              placeholder="0.00"
            />
          </Field>
        </Grid>

        {/* Accessorials — dynamic list */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Accessorials</span>
            <button
              type="button"
              onClick={addAccessorial}
              className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase transition-colors hover:text-red-600"
            >
              + Add row
            </button>
          </div>
          {accessorials.length === 0 ? (
            <p className="mt-2.5 font-mono text-xs text-zinc-600">
              None. Add detention, tarp, lumper, etc. if applicable.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {accessorials.map((a) => (
                <li
                  key={a.id}
                  className="grid grid-cols-[1fr_120px_40px] gap-2"
                >
                  <input
                    type="text"
                    value={a.label}
                    onChange={(e) =>
                      updateAccessorial(a.id, { label: e.target.value })
                    }
                    placeholder="Detention"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={a.amount}
                    onChange={(e) =>
                      updateAccessorial(a.id, { amount: e.target.value })
                    }
                    placeholder="150.00"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeAccessorial(a.id)}
                    title="Remove"
                    aria-label="Remove accessorial"
                    className="inline-flex items-center justify-center border border-zinc-300 bg-zinc-100 text-sm text-zinc-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Total preview */}
        <div className="mt-5 flex items-center justify-between border-t border-zinc-200 pt-4">
          <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
            Total preview
          </span>
          <span className="font-mono text-lg font-semibold text-zinc-900">
            {previewTotal().toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </span>
        </div>
      </Section>

      {/* Terms */}
      <Section title="Terms">
        <Grid>
          <Field label="Expires on">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Payment terms">
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className={inputCls}
              placeholder="Net 30"
            />
          </Field>
        </Grid>
        <Field label="Special instructions">
          <textarea
            rows={3}
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            className={`${inputCls} mt-2.5 resize-y`}
            placeholder="Tarp required, permitted load, etc."
          />
        </Field>
      </Section>

      {/* Error */}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-300 bg-red-50 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-800">{error}</p>
        </div>
      ) : null}

      {/* Submit */}
      <div className="border-t border-zinc-200 pt-5">
        <button
          type="submit"
          disabled={isPending}
          className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Generating PDF…" : "Generate Quote PDF"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
        {title}
      </legend>
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
