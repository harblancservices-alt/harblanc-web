import { describe, expect, it } from "vitest";
import {
  CONTACT_ROLE_PRESETS,
  ROLE_OTHER,
  isPresetTitle,
  roleFromTitle,
} from "./contactRoles";
import { ROLE_CATEGORIES } from "./roles";

describe("the preset list itself", () => {
  it("stays inside the range Brent asked for", () => {
    expect(CONTACT_ROLE_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(CONTACT_ROLE_PRESETS.length).toBeLessThanOrEqual(15);
  });

  it("never invents a role_category roles.ts does not have", () => {
    // The whole reason the presets carry a category is to feed the EXISTING
    // pills. A typo here would write a value no pill knows how to colour.
    for (const preset of CONTACT_ROLE_PRESETS) {
      expect(ROLE_CATEGORIES).toContain(preset.category);
    }
  });

  it("has no duplicate titles", () => {
    const seen = new Set(CONTACT_ROLE_PRESETS.map((r) => r.title.toLowerCase()));
    expect(seen.size).toBe(CONTACT_ROLE_PRESETS.length);
  });

  it("never uses the Other sentinel as a real title", () => {
    expect(CONTACT_ROLE_PRESETS.some((r) => r.title === ROLE_OTHER)).toBe(false);
  });
});

describe("roleFromTitle", () => {
  it("maps each preset to its own bucket", () => {
    expect(roleFromTitle("Owner")).toBe("owner");
    expect(roleFromTitle("President")).toBe("executive");
    expect(roleFromTitle("Dock Supervisor")).toBe("shipping_receiving");
    expect(roleFromTitle("Buyer")).toBe("purchasing");
    expect(roleFromTitle("Accounts Payable")).toBe("accounts_payable");
  });

  it("recognises a title that came from the old free-text field", () => {
    // Live data holds "Purchasing Manager" typed by hand, in whatever case
    // and spacing the rep used. Those contacts must preselect the dropdown,
    // not fall into Other.
    expect(roleFromTitle("purchasing manager")).toBe("purchasing");
    expect(roleFromTitle("  BUYER  ")).toBe("purchasing");
    expect(roleFromTitle("Traffic   Manager")).toBe("logistics");
  });

  it("returns null for a title nobody listed, rather than guessing", () => {
    // "VP Operations" is real live data at Metallic. It is NOT Operations
    // Manager, and quietly filing it as one would be a fabrication.
    expect(roleFromTitle("VP Operations")).toBeNull();
    expect(roleFromTitle("Manager, Purchasing")).toBeNull();
    expect(roleFromTitle("Owner & President")).toBeNull();
  });

  it("treats blank and missing as no role", () => {
    expect(roleFromTitle(null)).toBeNull();
    expect(roleFromTitle(undefined)).toBeNull();
    expect(roleFromTitle("   ")).toBeNull();
  });
});

describe("isPresetTitle", () => {
  it("agrees with roleFromTitle on every preset", () => {
    for (const preset of CONTACT_ROLE_PRESETS) {
      expect(isPresetTitle(preset.title)).toBe(true);
      expect(roleFromTitle(preset.title)).toBe(preset.category);
    }
  });

  it("is false for free text, so the dialog opens on Other", () => {
    expect(isPresetTitle("VP Operations")).toBe(false);
    expect(isPresetTitle(null)).toBe(false);
  });
});
