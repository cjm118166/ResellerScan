import { describe, expect, it } from "vitest";
import type { RawEbayItem } from "../lib/candidates";
import { calculateFees } from "../lib/fees";
import {
  buildScanResponse,
  evaluateLookupAttemptCounts,
  type BarcodeResolution,
  type LookupAttemptDiagnostic,
} from "../lib/scan-service";

const GAME_CATEGORY = "Video Games & Consoles|Video Games";

function resolution(overrides: Partial<BarcodeResolution> = {}): BarcodeResolution {
  return {
    inputBarcode: "045496590581",
    inputSymbology: "UPC_A",
    resolvedBarcode: "045496590581",
    resolvedBarcodeType: "UPC_A",
    queryBarcode: "045496590581",
    resolutionMode: "CLIENT_SYMBOLOGY",
    fallbackUsed: false,
    fallbackAttempted: false,
    ...overrides,
  };
}

let sequence = 0;
function item(overrides: Partial<RawEbayItem> = {}): RawEbayItem {
  sequence += 1;
  return {
    itemId: `item-${sequence}`,
    title: "Mario Kart 8 Deluxe",
    itemWebUrl: "https://ebay.com/itm/x",
    image: { imageUrl: "https://img/x.jpg" },
    price: { value: "40.00", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }],
    condition: "New",
    conditionId: "1000",
    buyingOptions: ["FIXED_PRICE"],
    categoryPath: GAME_CATEGORY,
    ...overrides,
  };
}

const NEW = { conditionId: "1000", condition: "Brand New" };
const USED = { conditionId: "3000", condition: "Used" };

function mixedFixture(): RawEbayItem[] {
  return [
    item({ itemId: "new-floor", price: { value: "39.99", currency: "USD" }, ...NEW }),
    item({ itemId: "new-mid", price: { value: "44.99", currency: "USD" }, ...NEW }),
    item({ itemId: "used-floor", price: { value: "26.99", currency: "USD" }, ...USED }),
    item({ itemId: "used-mid", price: { value: "30.00", currency: "USD" }, ...USED }),
    item({
      itemId: "used-disc",
      title: "Mario Kart 8 DISC ONLY",
      price: { value: "9.99", currency: "USD" },
      ...USED,
    }),
    item({
      itemId: "open-box",
      condition: "Open box",
      conditionId: "1500",
      price: { value: "24.99", currency: "USD" },
    }),
    item({
      itemId: "new-defects",
      condition: "New with defects",
      conditionId: "1750",
      price: { value: "21.99", currency: "USD" },
    }),
    item({
      itemId: "refurb",
      condition: "Certified Refurbished",
      conditionId: "2000",
      price: { value: "22.99", currency: "USD" },
    }),
    item({
      itemId: "parts",
      condition: "For parts or not working",
      conditionId: "7000",
      price: { value: "5.00", currency: "USD" },
    }),
    item({
      itemId: "unknown",
      condition: undefined,
      conditionId: undefined,
      price: { value: "19.99", currency: "USD" },
    }),
  ];
}

describe("New/Used response partitioning", () => {
  it("prices New and Used independently and mirrors New into V1 fields", () => {
    const { response } = buildScanResponse({
      barcodeResolution: resolution(),
      items: mixedFixture(),
      rawResultCount: 500,
      resultSetTruncated: true,
    });

    expect(response.defaultCondition).toBe("NEW");
    expect(response.found).toBe(true);
    expect(response.counts.resultSetTruncated).toBe(true);

    const newResult = response.conditionResults.new;
    const usedResult = response.conditionResults.used;

    expect(newResult.marketFloorPrice).toBe("39.99");
    expect(newResult.topMatch?.itemId).toBe("new-floor");
    expect(newResult.floorListing?.itemId).toBe("new-floor");

    expect(usedResult.marketFloorPrice).toBe("26.99");
    expect(usedResult.topMatch?.itemId).toBe("used-floor");
    expect(usedResult.floorListing?.itemId).toBe("used-floor");

    expect(response.metrics?.marketFloorPrice).toBe("39.99");
    expect(response.topMatch?.itemId).toBe("new-floor");
    expect(response.floorListing?.itemId).toBe("new-floor");

    const newFees = calculateFees(39.99);
    expect(newResult.estimatedEbayFee).toBe(newFees.estimatedFee.toFixed(2));
    expect(newResult.netPayoutEstimate).toBe(newFees.netPayout.toFixed(2));

    expect(response.excludedConditionCounts).toMatchObject({
      openBox: 1,
      newWithDefects: 1,
      refurbished: 1,
      forParts: 1,
      unknown: 1,
    });
  });

  it("never lets Used set New pricing or New set Used pricing", () => {
    const { response } = buildScanResponse({
      barcodeResolution: resolution(),
      items: [
        item({ itemId: "used-cheap", price: { value: "10.00", currency: "USD" }, ...USED }),
        item({ itemId: "new-expensive", price: { value: "50.00", currency: "USD" }, ...NEW }),
      ],
    });

    expect(response.conditionResults.new.marketFloorPrice).toBe("50.00");
    expect(response.conditionResults.used.marketFloorPrice).toBe("10.00");
  });

  it("returns Used-only without silently populating legacy New fields", () => {
    const { response } = buildScanResponse({
      barcodeResolution: resolution(),
      items: [item({ itemId: "used", price: { value: "18.00", currency: "USD" }, ...USED })],
    });

    expect(response.found).toBe(true);
    expect(response.conditionResults.new.found).toBe(false);
    expect(response.conditionResults.used.found).toBe(true);
    expect(response.metrics).toBeUndefined();
    expect(response.topMatch).toBeUndefined();
    expect(response.floorListing).toBeUndefined();
  });

  it("distinguishes no results from no eligible New/Used pricing", () => {
    const noResults = buildScanResponse({
      barcodeResolution: resolution(),
      items: [],
    }).response;
    expect(noResults.reason).toBe("NO_RESULTS");

    const noEligible = buildScanResponse({
      barcodeResolution: resolution(),
      items: [
        item({ itemId: "open", conditionId: "1500", condition: "Open box" }),
      ],
    }).response;
    expect(noEligible.reason).toBe("NO_ELIGIBLE_MATCHES");
  });
});

describe("ambiguous lookup attempt eligibility", () => {
  it("does not stop fallback for Open Box, Refurbished, auction-only, or wrong-currency results", () => {
    const counts = evaluateLookupAttemptCounts([
      item({ itemId: "open", conditionId: "1500", condition: "Open box" }),
      item({ itemId: "refurb", conditionId: "2000", condition: "Refurbished" }),
      item({ itemId: "auction", buyingOptions: ["AUCTION"], ...USED }),
      item({ itemId: "gbp", price: { value: "20", currency: "GBP" }, ...NEW }),
    ]);

    expect(counts.matchedListingCount).toBeGreaterThan(0);
    expect(counts.pricingEligibleMatchCount).toBe(0);
  });

  it("stops fallback when at least one priceable New or Used listing exists", () => {
    const counts = evaluateLookupAttemptCounts([
      item({ itemId: "used-fixed", ...USED }),
    ]);
    expect(counts.pricingEligibleMatchCount).toBe(1);
  });

  it("preserves lookup diagnostics in the response", () => {
    const attempts: LookupAttemptDiagnostic[] = [
      {
        barcode: "01234565",
        barcodeType: "EAN_8",
        matchedListingCount: 2,
        pricingEligibleMatchCount: 0,
        eligibleMatchCount: 0,
        selected: false,
      },
      {
        barcode: "012345000065",
        barcodeType: "UPC_E",
        matchedListingCount: 1,
        pricingEligibleMatchCount: 1,
        eligibleMatchCount: 1,
        selected: true,
      },
    ];

    const { response } = buildScanResponse({
      barcodeResolution: resolution({
        inputBarcode: "01234565",
        inputSymbology: "UNKNOWN",
        resolvedBarcode: "012345000065",
        resolvedBarcodeType: "UPC_E",
        queryBarcode: "012345000065",
        resolutionMode: "UPC_E_EXPANSION_FALLBACK",
        fallbackUsed: true,
        fallbackAttempted: true,
        originalUPCE: "01234565",
        expandedUPCA: "012345000065",
      }),
      items: [item({ itemId: "new", ...NEW })],
      lookupAttempts: attempts,
    });

    expect(response.lookupAttempts).toEqual(attempts);
    expect(response.barcodeResolution.fallbackUsed).toBe(true);
  });
});
