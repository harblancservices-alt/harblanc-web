import { describe, expect, it } from "vitest";
import { dedupeEntryName, safePacketFileName, MAX_PACKET_NAME_LENGTH } from "./packetContract";

describe("safePacketFileName", () => {
  it("keeps an ordinary name, collapsing spaces to dashes", () => {
    expect(safePacketFileName("Vendor Packet Alamo")).toBe("Vendor-Packet-Alamo");
  });

  it("strips characters that would break a Content-Disposition header", () => {
    expect(safePacketFileName('Vendor "Packet" / 2026 \\ #1')).toBe("Vendor-Packet-2026-1");
  });

  it("keeps dots, dashes and underscores", () => {
    expect(safePacketFileName("acme_v1.2-final")).toBe("acme_v1.2-final");
  });

  it("trims leading and trailing separators", () => {
    expect(safePacketFileName("  --Alamo--  ")).toBe("Alamo");
  });

  it("falls back to 'packet' when nothing survives", () => {
    expect(safePacketFileName("///")).toBe("packet");
    expect(safePacketFileName("")).toBe("packet");
  });

  it("caps the length", () => {
    expect(safePacketFileName("a".repeat(500))).toHaveLength(MAX_PACKET_NAME_LENGTH);
  });
});

describe("dedupeEntryName", () => {
  it("keeps original filenames when there is no collision", () => {
    const taken = new Set<string>();
    expect(dedupeEntryName("W9.pdf", taken)).toBe("W9.pdf");
    expect(dedupeEntryName("COI.pdf", taken)).toBe("COI.pdf");
  });

  it("numbers collisions before the extension", () => {
    const taken = new Set<string>();
    expect(dedupeEntryName("W9.pdf", taken)).toBe("W9.pdf");
    expect(dedupeEntryName("W9.pdf", taken)).toBe("W9 (2).pdf");
    expect(dedupeEntryName("W9.pdf", taken)).toBe("W9 (3).pdf");
  });

  it("handles names with no extension", () => {
    const taken = new Set<string>();
    expect(dedupeEntryName("agreement", taken)).toBe("agreement");
    expect(dedupeEntryName("agreement", taken)).toBe("agreement (2)");
  });

  it("does not treat a leading dot as an extension separator", () => {
    const taken = new Set<string>();
    expect(dedupeEntryName(".env", taken)).toBe(".env");
    expect(dedupeEntryName(".env", taken)).toBe(".env (2)");
  });

  it("falls back to 'document' for a blank name", () => {
    const taken = new Set<string>();
    expect(dedupeEntryName("   ", taken)).toBe("document");
  });
});
