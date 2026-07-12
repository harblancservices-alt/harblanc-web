import { describe, it, expect } from "vitest";
import {
  fileExt,
  loadDocName,
  normalizeLoadDocKind,
  receiptName,
  shortDate,
  withExt,
} from "./doc-name";

describe("loadDocName", () => {
  const load = { loadNumber: "137597", broker: "TQL" };

  it("names a lone doc without a number", () => {
    expect(loadDocName({ kind: "rate_con", ...load })).toBe("RC - 137597 - TQL");
    expect(loadDocName({ kind: "bol", ...load })).toBe("BOL - 137597 - TQL");
    expect(loadDocName({ kind: "pod", ...load })).toBe("POD - 137597 - TQL");
  });

  it("numbers same-type siblings in upload order", () => {
    expect(loadDocName({ kind: "rate_con", ...load, index: 1, total: 2 })).toBe(
      "RC 1 - 137597 - TQL",
    );
    expect(loadDocName({ kind: "rate_con", ...load, index: 2, total: 2 })).toBe(
      "RC 2 - 137597 - TQL",
    );
  });

  it("suffixes a signed BOL", () => {
    expect(loadDocName({ kind: "bol", ...load, signed: true })).toBe(
      "BOL - 137597 - TQL - signed",
    );
    expect(
      loadDocName({ kind: "bol", ...load, signed: true, index: 2, total: 2 }),
    ).toBe("BOL 2 - 137597 - TQL - signed");
  });

  it("falls back to em dashes when load # / broker are missing", () => {
    expect(loadDocName({ kind: "bol", loadNumber: null, broker: "" })).toBe(
      "BOL - — - —",
    );
  });
});

describe("normalizeLoadDocKind", () => {
  it("maps known kinds and defaults the rest to other", () => {
    expect(normalizeLoadDocKind("rate_con")).toBe("rate_con");
    expect(normalizeLoadDocKind("bol")).toBe("bol");
    expect(normalizeLoadDocKind("pod")).toBe("pod");
    expect(normalizeLoadDocKind("something")).toBe("other");
    expect(normalizeLoadDocKind(null)).toBe("other");
  });
});

describe("receiptName", () => {
  it("uses the first part name + service date", () => {
    expect(receiptName({ firstPartName: "Track bar", date: "2026-07-09" })).toBe(
      "Track bar - Jul 9",
    );
  });
  it("falls back to Service when no part is known", () => {
    expect(receiptName({ firstPartName: null, date: "2026-07-09" })).toBe(
      "Service - Jul 9",
    );
  });
});

describe("shortDate", () => {
  it("formats date-only and timestamp values in UTC", () => {
    expect(shortDate("2026-07-09")).toBe("Jul 9");
    expect(shortDate("2026-07-09T23:30:00Z")).toBe("Jul 9");
    expect(shortDate(null)).toBe("—");
  });
});

describe("fileExt / withExt", () => {
  it("extracts the real extension", () => {
    expect(fileExt("scan.PDF")).toBe(".pdf");
    expect(fileExt("photo.jpeg")).toBe(".jpeg");
    expect(fileExt("noext")).toBe("");
  });
  it("re-appends the source extension to a canonical base", () => {
    expect(withExt("BOL - 137597 - TQL", "scan.pdf")).toBe(
      "BOL - 137597 - TQL.pdf",
    );
    expect(withExt("Track bar - Jul 9", "receipt.JPG")).toBe(
      "Track bar - Jul 9.jpg",
    );
  });
});
