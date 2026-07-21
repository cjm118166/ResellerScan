// Network-free orchestration from raw eBay ItemSummary records to the public
// ResellerScan response. New and Used are always computed independently from
// the same strict-GTIN candidate set.

import type {
  BarcodeSymbology,
  ResolvedBarcodeType,
  ResolutionMode,
} from "./barcode";
import {
  dedupeCandidates,
  normalizeCandidate,
  selectFloorListingForGroup,
  type Candidate,
  type NormalizeOptions,
  type RawEbayItem,
} from "./candidates";
import { calculateFees } from "./fees";
import { EBAY_MARKETPLACE } from "./ebay";

export type ScanListing = {
  itemId: string;
  title: string;
  price: number;
  url: string;
  image?: string;
  condition?: string;
  conditionGroup?: "NEW" | "USED";
  shippingPrice?: number;
};

export type ScanCounts = {
  rawResultCount?: number;
  fetchedResultCount: number;
  evaluatedCandidateCount: number;
  matchedListingCount: number;
  pricingSampleCount: number;
  /** True when eBay reported more strict-GTIN results than this snapshot fetched. */
  resultSetTruncated: boolean;
};

export type ScanMetrics = {
  totalActiveCompetitors: number;
  marketFloorPrice: string;
  estimatedEbayFee: string;
  netPayoutEstimate: string;
};

export type BarcodeResolution = {
  inputBarcode: string;
  inputSymbology: BarcodeSymbology;
  resolvedBarcode: string;
  resolvedBarcodeType: ResolvedBarcodeType;
  queryBarcode: string;
  resolutionMode: ResolutionMode;
  /** True only when the UPC-E expansion attempt supplied the selected result. */
  fallbackUsed: boolean;
  /** True when a second lookup was attempted, even if it was not selected. */
  fallbackAttempted?: boolean;
  originalUPCE?: string;
  expandedUPCA?: string;
};

export type LookupAttemptDiagnostic = {
  barcode: string;
  barcodeType: string;
  /** Identity-clean listings, regardless of whether they are priceable New/Used. */
  matchedListingCount: number;
  /** Pricing-eligible NEW or USED listings. This decides ambiguous 8-digit fallback. */
  pricingEligibleMatchCount: number;
  /** Backward-compatible alias of pricingEligibleMatchCount. */
  eligibleMatchCount: number;
  selected: boolean;
};

export type ConditionResult = {
  conditionGroup: "NEW" | "USED";
  found: boolean;
  counts: {
    matchedListingCount: number;
    pricingSampleCount: number;
  };
  marketFloorPrice?: string;
  estimatedEbayFee?: string;
  netPayoutEstimate?: string;
  topMatch?: ScanListing;
  floorListing?: ScanListing;
};

export type ExcludedConditionCounts = {
  openBox: number;
  newWithDefects: number;
  refurbished: number;
  forParts: number;
  unknown: number;
};

export type ScanResponse = {
  found: boolean;
  defaultCondition: "NEW";
  barcode: string;
  normalizedBarcode: string;
  barcodeType: ResolvedBarcodeType;
  marketplace: "EBAY_US";
  currency: "USD";
  queryMode: "STRICT_GTIN";
  counts: ScanCounts;
  reason?: "NO_ELIGIBLE_MATCHES" | "NO_RESULTS";
  barcodeResolution: BarcodeResolution;
  conditionResults: {
    new: ConditionResult;
    used: ConditionResult;
  };
  excludedConditionCounts: ExcludedConditionCounts;
  lookupAttempts?: LookupAttemptDiagnostic[];

  // Legacy V1 fields. They mirror New only and are omitted when no New pricing
  // result exists. The updated iOS client must prefer conditionResults.
  metrics?: ScanMetrics;
  topMatch?: ScanListing;
  floorListing?: ScanListing;
};

export type BuildScanInput = {
  barcodeResolution: BarcodeResolution;
  items: RawEbayItem[];
  rawResultCount?: number;
  resultSetTruncated?: boolean;
  normalizeOptions?: NormalizeOptions;
  lookupAttempts?: LookupAttemptDiagnostic[];
};

/** Heuristic used only for video-game completeness rejection rules. */
export function detectVideoGame(items: RawEbayItem[]): boolean {
  let categoryCount = 0;
  let videoGameCount = 0;

  for (const item of items) {
    const categoryText = [
      item.categoryPath ?? "",
      ...(item.categories?.map((category) => category.categoryName ?? "") ?? []),
    ]
      .join(" ")
      .toLowerCase();

    if (!categoryText.trim()) continue;
    categoryCount += 1;
    if (categoryText.includes("video game")) videoGameCount += 1;
  }

  return categoryCount > 0 && videoGameCount / categoryCount >= 0.5;
}

export function normalizeAndDedupe(
  items: RawEbayItem[],
  normalizeOptions?: NormalizeOptions,
): Candidate[] {
  const options: NormalizeOptions = {
    ...normalizeOptions,
    isVideoGame: normalizeOptions?.isVideoGame ?? detectVideoGame(items),
  };

  const normalized = items
    .map((item) => normalizeCandidate(item, options))
    .filter((candidate): candidate is Candidate => candidate !== null);

  return dedupeCandidates(normalized, EBAY_MARKETPLACE);
}

export type LookupAttemptCounts = {
  matchedListingCount: number;
  pricingEligibleMatchCount: number;
};

/**
 * Evaluate whether one strict-GTIN attempt is good enough to select.
 *
 * Ambiguous manual eight-digit input must not stop at raw EAN-8 merely because
 * eBay returned an Open Box, Refurbished, auction-only, wrong-currency, or
 * otherwise non-priceable listing. Selection requires at least one pricing-
 * eligible New or Used result.
 */
export function evaluateLookupAttemptCounts(
  items: RawEbayItem[],
  normalizeOptions?: NormalizeOptions,
): LookupAttemptCounts {
  const candidates = normalizeAndDedupe(items, normalizeOptions);
  return {
    matchedListingCount: candidates.filter((candidate) => candidate.eligibleForDisplay).length,
    pricingEligibleMatchCount: candidates.filter(
      (candidate) =>
        candidate.eligibleForPricing &&
        (candidate.conditionGroup === "NEW" || candidate.conditionGroup === "USED"),
    ).length,
  };
}

/** Backward-compatible helper: now means pricing-eligible New/Used matches. */
export function evaluateEligibleMatchCount(
  items: RawEbayItem[],
  normalizeOptions?: NormalizeOptions,
): number {
  return evaluateLookupAttemptCounts(items, normalizeOptions).pricingEligibleMatchCount;
}

function toListing(candidate: Candidate): ScanListing {
  if (candidate.conditionGroup !== "NEW" && candidate.conditionGroup !== "USED") {
    throw new Error("Only New or Used candidates can be exposed as priced listings.");
  }

  return {
    itemId: candidate.itemId,
    title: candidate.title,
    price: candidate.itemPrice,
    url: candidate.url,
    image: candidate.imageURL,
    condition: candidate.condition,
    conditionGroup: candidate.conditionGroup,
    shippingPrice: candidate.shippingPrice,
  };
}

function buildConditionResult(
  candidates: Candidate[],
  group: "NEW" | "USED",
): ConditionResult {
  const groupCandidates = candidates.filter((candidate) => candidate.conditionGroup === group);
  const matchedListingCount = groupCandidates.filter(
    (candidate) => candidate.eligibleForDisplay,
  ).length;
  const pricingSampleCount = groupCandidates.filter(
    (candidate) => candidate.eligibleForPricing,
  ).length;

  const floor = selectFloorListingForGroup(candidates, group);
  if (!floor) {
    return {
      conditionGroup: group,
      found: false,
      counts: { matchedListingCount, pricingSampleCount },
    };
  }

  const fees = calculateFees(floor.itemPrice);
  const listing = toListing(floor);

  return {
    conditionGroup: group,
    found: true,
    counts: { matchedListingCount, pricingSampleCount },
    marketFloorPrice: fees.basePrice.toFixed(2),
    estimatedEbayFee: fees.estimatedFee.toFixed(2),
    netPayoutEstimate: fees.netPayout.toFixed(2),
    topMatch: listing,
    floorListing: listing,
  };
}

export function buildScanResponse(input: BuildScanInput): {
  response: ScanResponse;
  candidates: Candidate[];
  newFloor: Candidate | null;
  usedFloor: Candidate | null;
} {
  const fetchedResultCount = input.items.length;
  const candidates = normalizeAndDedupe(input.items, input.normalizeOptions);

  const matchedCandidates = candidates.filter((candidate) => candidate.eligibleForDisplay);
  const pricingCandidates = candidates.filter((candidate) => candidate.eligibleForPricing);

  const rawResultCount = input.rawResultCount;
  const resultSetTruncated =
    input.resultSetTruncated ??
    (typeof rawResultCount === "number" && rawResultCount > fetchedResultCount);

  const counts: ScanCounts = {
    rawResultCount,
    fetchedResultCount,
    evaluatedCandidateCount: candidates.length,
    matchedListingCount: matchedCandidates.length,
    pricingSampleCount: pricingCandidates.length,
    resultSetTruncated,
  };

  const excludedConditionCounts: ExcludedConditionCounts = {
    openBox: candidates.filter((candidate) => candidate.conditionGroup === "OPEN_BOX").length,
    newWithDefects: candidates.filter(
      (candidate) => candidate.conditionGroup === "NEW_WITH_DEFECTS",
    ).length,
    refurbished: candidates.filter(
      (candidate) => candidate.conditionGroup === "REFURBISHED",
    ).length,
    forParts: candidates.filter((candidate) => candidate.conditionGroup === "FOR_PARTS").length,
    unknown: candidates.filter((candidate) => candidate.conditionGroup === "UNKNOWN").length,
  };

  const newResult = buildConditionResult(candidates, "NEW");
  const usedResult = buildConditionResult(candidates, "USED");
  const newFloor = selectFloorListingForGroup(candidates, "NEW");
  const usedFloor = selectFloorListingForGroup(candidates, "USED");

  const resolution = input.barcodeResolution;
  const found = newResult.found || usedResult.found;

  const response: ScanResponse = {
    found,
    defaultCondition: "NEW",
    barcode: resolution.inputBarcode,
    normalizedBarcode: resolution.queryBarcode,
    barcodeType: resolution.resolvedBarcodeType,
    marketplace: "EBAY_US",
    currency: "USD",
    queryMode: "STRICT_GTIN",
    counts,
    barcodeResolution: resolution,
    conditionResults: {
      new: newResult,
      used: usedResult,
    },
    excludedConditionCounts,
    lookupAttempts: input.lookupAttempts,
  };

  if (!found) {
    response.reason = fetchedResultCount === 0 ? "NO_RESULTS" : "NO_ELIGIBLE_MATCHES";
  }

  // Keep the legacy V1 fields coherent by mapping every one of them to the New
  // floor listing. Never silently substitute Used into the legacy contract.
  if (newResult.found && newResult.topMatch && newResult.floorListing) {
    response.metrics = {
      totalActiveCompetitors: newResult.counts.matchedListingCount,
      marketFloorPrice: newResult.marketFloorPrice!,
      estimatedEbayFee: newResult.estimatedEbayFee!,
      netPayoutEstimate: newResult.netPayoutEstimate!,
    };
    response.topMatch = newResult.topMatch;
    response.floorListing = newResult.floorListing;
  }

  return { response, candidates, newFloor, usedFloor };
}
