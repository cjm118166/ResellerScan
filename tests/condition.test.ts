import { describe, expect, it } from "vitest";
import { mapCondition } from "../lib/condition";

describe("eBay condition mapping", () => {
  it("maps ordinary New and Used families", () => {
    expect(mapCondition({ conditionId: "1000", conditionLabel: "Brand New" })).toBe("NEW");
    expect(mapCondition({ conditionId: "2750", conditionLabel: "Like New" })).toBe("USED");
    expect(mapCondition({ conditionId: "2990", conditionLabel: "Pre-owned - Excellent" })).toBe("USED");
    expect(mapCondition({ conditionId: "3010", conditionLabel: "Pre-owned - Fair" })).toBe("USED");
  });

  it("refines condition ID 1500 using the returned label", () => {
    expect(mapCondition({ conditionId: "1500", conditionLabel: "Open box" })).toBe("OPEN_BOX");
    expect(mapCondition({ conditionId: "1500", conditionLabel: "New without tags" })).toBe("NEW");
    expect(mapCondition({ conditionId: "1500" })).toBe("OPEN_BOX");
  });

  it("keeps New with defects out of ordinary New", () => {
    expect(mapCondition({ conditionId: "1750", conditionLabel: "New with defects" })).toBe(
      "NEW_WITH_DEFECTS",
    );
  });

  it("does not infer condition from product-name substrings", () => {
    expect(mapCondition({ titleFallback: "Fairy Tail Nintendo Switch" })).toBe("UNKNOWN");
    expect(mapCondition({ titleFallback: "New Super Mario Bros. U Deluxe" })).toBe("UNKNOWN");
  });

  it("maps refurbished, parts, and missing condition separately", () => {
    expect(mapCondition({ conditionId: "2000", conditionLabel: "Certified Refurbished" })).toBe(
      "REFURBISHED",
    );
    expect(mapCondition({ conditionId: "7000", conditionLabel: "For parts or not working" })).toBe(
      "FOR_PARTS",
    );
    expect(mapCondition({})).toBe("UNKNOWN");
  });
});
