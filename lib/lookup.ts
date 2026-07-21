// Shared strict-GTIN lookup execution used by the public and diagnostics routes.
// Keeps ambiguous eight-digit fallback behavior identical in both endpoints.

import type { BarcodePlan, LookupAttempt } from "./barcode";
import type { RawEbayItem } from "./candidates";
import { searchByGtin } from "./ebay";
import {
  evaluateLookupAttemptCounts,
  type BarcodeResolution,
  type LookupAttemptDiagnostic,
} from "./scan-service";

export type ExecutedLookup = {
  barcodeResolution: BarcodeResolution;
  lookupAttempts: LookupAttemptDiagnostic[];
  items: RawEbayItem[];
  rawResultCount?: number;
  resultSetTruncated: boolean;
};

type AttemptResult = {
  attempt: LookupAttempt;
  items: RawEbayItem[];
  rawResultCount?: number;
  resultSetTruncated: boolean;
  matchedListingCount: number;
  pricingEligibleMatchCount: number;
};

/**
 * Execute a validated BarcodePlan.
 *
 * For UNKNOWN eight-digit input:
 * 1. Search raw EAN-8.
 * 2. Select it only if it yields at least one pricing-eligible New/Used result.
 * 3. Otherwise try UPC-E expansion.
 * 4. If neither succeeds, retain raw EAN-8 as the selected representation while
 *    returning found:false later; diagnostics still show that fallback was tried.
 */
export async function executeBarcodePlan(
  plan: Extract<BarcodePlan, { valid: true }>,
  search: typeof searchByGtin = searchByGtin,
): Promise<ExecutedLookup> {
  const attemptResults: AttemptResult[] = [];
  let selectedIndex = -1;

  for (let index = 0; index < plan.attempts.length; index += 1) {
    const attempt = plan.attempts[index];
    const searchResult = await search(attempt.queryBarcode);
    const counts = evaluateLookupAttemptCounts(searchResult.items);

    attemptResults.push({
      attempt,
      items: searchResult.items,
      rawResultCount: searchResult.rawResultCount,
      resultSetTruncated: searchResult.resultSetTruncated,
      matchedListingCount: counts.matchedListingCount,
      pricingEligibleMatchCount: counts.pricingEligibleMatchCount,
    });

    if (counts.pricingEligibleMatchCount > 0) {
      selectedIndex = index;
      break;
    }
  }

  // No attempt produced a priceable New/Used result. The raw EAN-8 attempt remains
  // the primary interpretation rather than pretending the UPC-E fallback won.
  if (selectedIndex === -1) selectedIndex = 0;

  const selected = attemptResults[selectedIndex];
  const fallbackAttempted = attemptResults.length > 1;
  const fallbackUsed = selectedIndex > 0;

  const lookupAttempts: LookupAttemptDiagnostic[] = attemptResults.map((result, index) => ({
    barcode: result.attempt.queryBarcode,
    barcodeType: result.attempt.resolvedBarcodeType,
    matchedListingCount: result.matchedListingCount,
    pricingEligibleMatchCount: result.pricingEligibleMatchCount,
    eligibleMatchCount: result.pricingEligibleMatchCount,
    selected: index === selectedIndex,
  }));

  const attempt = selected.attempt;
  const barcodeResolution: BarcodeResolution = {
    inputBarcode: plan.inputBarcode,
    inputSymbology: plan.inputSymbology,
    resolvedBarcode: attempt.resolvedBarcode,
    resolvedBarcodeType: attempt.resolvedBarcodeType,
    queryBarcode: attempt.queryBarcode,
    resolutionMode: attempt.resolutionMode,
    fallbackUsed,
    fallbackAttempted,
    originalUPCE: attempt.originalUPCE,
    expandedUPCA: attempt.expandedUPCA,
  };

  return {
    barcodeResolution,
    lookupAttempts,
    items: selected.items,
    rawResultCount: selected.rawResultCount,
    resultSetTruncated: selected.resultSetTruncated,
  };
}
