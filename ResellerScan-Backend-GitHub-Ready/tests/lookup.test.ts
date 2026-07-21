import { describe, expect, it } from "vitest";
import { planBarcodeLookup } from "../lib/barcode";
import type { RawEbayItem } from "../lib/candidates";
import type { GtinSearchResult } from "../lib/ebay";
import { executeBarcodePlan } from "../lib/lookup";

function listing(overrides: Partial<RawEbayItem> = {}): RawEbayItem {
  return {
    itemId: "item",
    title: "Product",
    itemWebUrl: "https://example.com",
    price: { value: "20.00", currency: "USD" },
    conditionId: "1000",
    condition: "New",
    buyingOptions: ["FIXED_PRICE"],
    ...overrides,
  };
}

describe("controlled unknown 8-digit lookup", () => {
  it("keeps raw EAN-8 when it has a pricing-eligible result", async () => {
    const plan = planBarcodeLookup("01234565", "UNKNOWN");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;

    const calls: string[] = [];
    const search = async (barcode: string): Promise<GtinSearchResult> => {
      calls.push(barcode);
      return {
        items: [listing()],
        rawResultCount: 1,
        resultSetTruncated: false,
      };
    };

    const result = await executeBarcodePlan(plan, search);
    expect(calls).toEqual(["01234565"]);
    expect(result.barcodeResolution.resolvedBarcodeType).toBe("EAN_8");
    expect(result.barcodeResolution.fallbackUsed).toBe(false);
  });

  it("uses UPC-E expansion when raw EAN-8 has no priceable New/Used result", async () => {
    const plan = planBarcodeLookup("01234565", "UNKNOWN");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;

    const calls: string[] = [];
    const search = async (barcode: string): Promise<GtinSearchResult> => {
      calls.push(barcode);
      if (barcode === "01234565") {
        return {
          items: [listing({ conditionId: "1500", condition: "Open box" })],
          rawResultCount: 1,
          resultSetTruncated: false,
        };
      }
      return {
        items: [listing({ itemId: "expanded-result" })],
        rawResultCount: 1,
        resultSetTruncated: false,
      };
    };

    const result = await executeBarcodePlan(plan, search);
    expect(calls).toEqual(["01234565", "012345000065"]);
    expect(result.barcodeResolution.resolvedBarcodeType).toBe("UPC_E");
    expect(result.barcodeResolution.fallbackUsed).toBe(true);
    expect(result.lookupAttempts[0].pricingEligibleMatchCount).toBe(0);
    expect(result.lookupAttempts[1].pricingEligibleMatchCount).toBe(1);
  });

  it("retains raw EAN-8 when neither attempt succeeds", async () => {
    const plan = planBarcodeLookup("01234565", "UNKNOWN");
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;

    const search = async (): Promise<GtinSearchResult> => ({
      items: [],
      rawResultCount: 0,
      resultSetTruncated: false,
    });

    const result = await executeBarcodePlan(plan, search);
    expect(result.lookupAttempts).toHaveLength(2);
    expect(result.barcodeResolution.resolvedBarcodeType).toBe("EAN_8");
    expect(result.barcodeResolution.fallbackAttempted).toBe(true);
    expect(result.barcodeResolution.fallbackUsed).toBe(false);
  });
});
