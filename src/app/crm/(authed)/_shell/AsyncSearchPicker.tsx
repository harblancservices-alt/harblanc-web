"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { CONTROL, LABEL } from "./form";

/**
 * Live search-as-you-type combobox over an async server lookup (a "use
 * server" action like searchCustomers/listCarriers) — the shipments
 * workspace's Customer/Carrier pickers. Generic over the result type `T` so
 * one component serves both. Opens on focus with an empty-query lookup
 * (every backing action already returns a sensible default page for `""`),
 * re-queries on each keystroke, and — same trick as the CRM's other
 * comboboxes (BOL's CustomerPicker, contacts' CompanyCombobox) — uses
 * onMouseDown+preventDefault on each result row so the click registers
 * before the input's onBlur can close the list out from under it.
 *
 * Selecting a row clears the input text (not a controlled "current value" —
 * the caller renders whatever it picked wherever makes sense for that
 * section, e.g. a chip above the picker) so the same box is immediately
 * ready to search again.
 */
export function AsyncSearchPicker<T>({
  label,
  placeholder,
  search,
  renderOption,
  getKey,
  onSelect,
  disabled,
  emptyText = "No matches.",
}: {
  label?: string;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  renderOption: (item: T) => ReactNode;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [pending, startTransition] = useTransition();
  const reqId = useRef(0);

  function runSearch(q: string) {
    const id = ++reqId.current;
    startTransition(async () => {
      const r = await search(q);
      if (id === reqId.current) setResults(r);
    });
  }

  useEffect(() => {
    // Run once on mount so an immediate focus shows results without a delay.
    runSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      {label && (
        <span className={`mb-1.5 block ${LABEL}`}>{label}</span>
      )}
      <input
        type="text"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          runSearch(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          runSearch(text);
        }}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        autoComplete="off"
        className={`h-11 w-full min-w-0 disabled:opacity-60 ${CONTROL}`}
      />
      {open && (
        <ul className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-64 w-full overflow-y-auto rounded-md border border-fg-subtle bg-card py-1 shadow-e3">
          {pending && results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-fg-subtle">Searching…</li>
          )}
          {!pending && results.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-fg-subtle">{emptyText}</li>
          )}
          {results.map((item) => (
            <li key={getKey(item)}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                  setText("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-fg hover:bg-inset"
              >
                {renderOption(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
