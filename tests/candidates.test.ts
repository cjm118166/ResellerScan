import { describe, expect, it } from "vitest";
import {
  dedupeCandidates,
  normalizeCandidate,
  selectFloorListing,
  type Candidate,
  type RawEbayItem,
} from "../lib/candidates";

function fixedPriceItem(overrides: Partial<RawEbayItem> = {}): RawEbayItem {
  return {
    itemId: "v1|100|0",
    title: "Nintendo Switch Sports",
    itemWebUrl: "https://ebay.com/itm/100",
    image: { imageUrl: "https://img/100.jpg" },
    price: { value: "39.99", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }],
    condition: "New",
    conditionId: "1000",
    buyingOptions: ["FIXED_PRICE"],
    ...overrides,
  };
}

describe("candidate eligibility", () => {
  it("prices a clean USD fixed-price New listing", () => {
    const candidate = normalizeCandidate(fixedPriceItem())!;
    expect(candidate.eligibleForDisplay).toBe(true);
    expect(candidate.eligibleForPricing).toBe(true);
    expect(candidate.conditionGroup).toBe("NEW");
  });

  it("excludes auction-only, wrong-currency, parts, and identity-only listings", () => {
    const auction = normalizeCandidate(fixedPriceItem({ buyingOptions: ["AUCTION"] }))!;
    expect(auction.eligibleForPricing).toBe(false);
    expect(auction.rejectionRuleIDs).toContain("auction_excluded");

    const wrongCurrency = normalizeCandidate(
      fixedPriceItem({ price: { value: "39.99", currency: "GBP" } }),
    )!;
    expect(wrongCurrency.eligibleForPricing).toBe(false);
    expect(wrongCurrency.rejectionRuleIDs).toContain("wrong_currency");

    const parts = normalizeCandidate(
      fixedPriceItem({ conditionId: "7000", condition: "For parts or not working" }),
    )!;
    expect(parts.eligibleForPricing).toBe(false);
    expect(parts.rejectionRuleIDs).toContain("parts_only");

    const caseOnly = normalizeCandidate(
      fixedPriceItem({ title: "Nintendo Switch Sports CASE ONLY" }),
    )!;
    expect(caseOnly.eligibleForDisplay).toBe(false);
    expect(caseOnly.eligibleForPricing).toBe(false);
  });

  it("does not infer local-pickup-only from pickupOptions plus missing shipping", () => {
    const candidate = normalizeCandidate(
      fixedPriceItem({
        pickupOptions: [{ pickupLocationType: "STORE" }],
        shippingOptions: undefined,
      }),
    )!;
    expect(candidate.buyingOptions).not.toContain("LOCAL_PICKUP");
    expect(candidate.rejectionRuleIDs).not.toContain("local_pickup_only");
    expect(candidate.eligibleForPricing).toBe(true);
  });

  it("excludes explicit LOCAL_PICKUP supplied by an upstream adapter", () => {
    const candidate = normalizeCandidate(
      fixedPriceItem({ buyingOptions: ["FIXED_PRICE", "LOCAL_PICKUP"] }),
    )!;
    expect(candidate.rejectionRuleIDs).toContain("local_pickup_only");
    expect(candidate.eligibleForPricing).toBe(false);
  });

  it("keeps Open Box and New with defects out of New pricing", () => {
    const openBox = normalizeCandidate(
      fixedPriceItem({ conditionId: "1500", condition: "Open box" }),
    )!;
    expect(openBox.conditionGroup).toBe("OPEN_BOX");
    expect(openBox.eligibleForPricing).toBe(false);

    const defects = normalizeCandidate(
      fixedPriceItem({ conditionId: "1750", condition: "New with defects" }),
    )!;
    expect(defects.conditionGroup).toBe("NEW_WITH_DEFECTS");
    expect(defects.eligibleForPricing).toBe(false);
  });
});

describe("deduplication and floor selection", () => {
  it("deduplicates by marketplace and item ID", () => {
    const first = normalizeCandidate(fixedPriceItem({ itemId: "dup" }))!;
    const second = normalizeCandidate(
      fixedPriceItem({ itemId: "dup", price: { value: "5.00", currency: "USD" } }),
    )!;
    expect(dedupeCandidates([first, second], "EBAY_US")).toEqual([first]);
  });

  function candidate(overrides: Partial<Candidate>): Candidate {
    return {
      itemId: "x",
      title: "Product",
      url: "https://example.com",
      itemPrice: 10,
      currency: "USD",
      conditionGroup: "USED",
      buyingOptions: ["FIXED_PRICE"],
      eligibleForDisplay: true,
      eligibleForPricing: true,
      rejectionRuleIDs: [],
      ...overrides,
    };
  }

  it("selects the cheapest eligible listing and uses deterministic tie-breaks", () => {
    expect(
      selectFloorListing([
        candidate({ itemId: "a", itemPrice: 20 }),
        candidate({ itemId: "b", itemPrice: 12 }),
      ])?.itemId,
    ).toBe("b");

    expect(
      selectFloorListing([
        candidate({ itemId: "z", itemPrice: 10, shippingPrice: undefined }),
        candidate({ itemId: "y", itemPrice: 10, shippingPrice: 4.99 }),
      ])?.itemId,
    ).toBe("y");
  });
});
