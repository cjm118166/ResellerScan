import { describe, it, expect } from "vitest";
import { evaluateTitleRejections, normalizeText } from "../lib/rejection-rules";
import { calculateFees, roundMoney } from "../lib/fees";

describe("rejection phrase normalization", () => {
  it("normalizes punctuation and casing into padded whole phrases", () => {
    expect(normalizeText("Case-Only!!")).toBe(" case only ");
  });

  it("matches whole phrases case-insensitively", () => {
    expect(evaluateTitleRejections({ title: "Zelda CASE ONLY no game" })).toContain("case_only");
  });

  it("flags box-only and empty package", () => {
    const ids = evaluateTitleRejections({ title: "Empty Box only replacement" });
    expect(ids).toContain("box_only");
    expect(ids).toContain("empty_package");
  });

  it("flags parts-only / not working", () => {
    expect(evaluateTitleRejections({ title: "Console for parts not working" })).toEqual(
      expect.arrayContaining(["parts_only", "not_working"]),
    );
  });

  it("flags lot / bundle", () => {
    expect(evaluateTitleRejections({ title: "Lot of 5 games" })).toContain("unmatched_lot");
    expect(evaluateTitleRejections({ title: "Bundle of controllers" })).toContain("unmatched_bundle");
  });

  it("only flags media-only for video games", () => {
    expect(evaluateTitleRejections({ title: "Mario Kart disc only" })).not.toContain("media_only_game");
    expect(evaluateTitleRejections({ title: "Mario Kart disc only", isVideoGame: true })).toContain(
      "media_only_game",
    );
  });

  it("avoids obvious product-title false positives", () => {
    expect(evaluateTitleRejections({ title: "Broken Sword 5 Nintendo Switch" })).not.toContain(
      "not_working",
    );
    expect(evaluateTitleRejections({ title: "USB-C Charger Only 65W" })).not.toContain(
      "accessory_only",
    );
  });

  it("does not flag a clean complete-product title", () => {
    expect(evaluateTitleRejections({ title: "Nintendo Switch Sports - Brand New Sealed" })).toEqual([]);
  });
});

describe("fee and payout rounding", () => {
  it("rounds fee and payout to two decimals and reconciles", () => {
    const f = calculateFees(29.99);
    expect(f.basePrice).toBe(29.99);
    // 29.99 * 0.1325 + 0.30 = 4.273675 -> 4.27
    expect(f.estimatedFee).toBe(4.27);
    expect(f.netPayout).toBe(roundMoney(29.99 - 4.27));
    expect(roundMoney(f.basePrice - f.estimatedFee)).toBe(f.netPayout);
  });

  it("handles values prone to floating point drift", () => {
    const f = calculateFees(19.99);
    expect(roundMoney(f.basePrice - f.estimatedFee)).toBe(f.netPayout);
  });
});
