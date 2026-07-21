import { describe, expect, it } from "vitest";
import {
  ean13ToUpcA,
  expandUpcE,
  planBarcodeLookup,
  validateBarcode,
} from "../lib/barcode";

describe("barcode validation", () => {
  it("accepts a valid UPC-A and preserves leading zeroes", () => {
    const result = validateBarcode(" 045496590581 ");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.type).toBe("UPC_A");
      expect(result.normalized).toBe("045496590581");
    }
  });

  it("accepts a valid EAN-13", () => {
    const result = validateBarcode("4006381333931");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.type).toBe("EAN_13");
  });

  it("preserves raw EAN-8 in legacy auto-detection", () => {
    const result = validateBarcode("96385074");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.type).toBe("EAN_8");
      expect(result.normalized).toBe("96385074");
    }
  });

  it("expands a known UPC-E correctly", () => {
    expect(expandUpcE("04252614")).toBe("042100005264");
  });

  it("rejects malformed and placeholder inputs", () => {
    for (const value of ["abc", "123", "", "000000000000", "045496590582"]) {
      expect(validateBarcode(value).valid).toBe(false);
    }
  });
});

describe("symbology-aware lookup planning", () => {
  it("uses a known EAN-8 as raw GTIN-8 only", () => {
    const plan = planBarcodeLookup("96385074", "EAN_8");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;
    expect(plan.attempts).toHaveLength(1);
    expect(plan.attempts[0]).toMatchObject({
      queryBarcode: "96385074",
      resolvedBarcodeType: "EAN_8",
      resolutionMode: "CLIENT_SYMBOLOGY",
    });
  });

  it("uses a known UPC-E as its expanded UPC-A query", () => {
    const plan = planBarcodeLookup("04252614", "UPC_E");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;
    expect(plan.attempts).toHaveLength(1);
    expect(plan.attempts[0]).toMatchObject({
      queryBarcode: "042100005264",
      resolvedBarcodeType: "UPC_E",
      originalUPCE: "04252614",
      expandedUPCA: "042100005264",
    });
  });

  it("plans raw EAN-8 before UPC-E fallback for ambiguous manual input", () => {
    const plan = planBarcodeLookup("01234565", "UNKNOWN");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;
    expect(plan.attempts.map((attempt) => attempt.resolvedBarcodeType)).toEqual([
      "EAN_8",
      "UPC_E",
    ]);
    expect(plan.attempts[0].queryBarcode).toBe("01234565");
    expect(plan.attempts[1].queryBarcode).toBe("012345000065");
  });

  it("normalizes leading-zero EAN-13 representation to UPC-A", () => {
    const value = "0045496590581";
    expect(ean13ToUpcA(value)).toBe("045496590581");
    const plan = planBarcodeLookup(value, "EAN_13");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;
    expect(plan.attempts[0].resolvedBarcodeType).toBe("UPC_A");
    expect(plan.attempts[0].queryBarcode).toBe("045496590581");
  });
});
