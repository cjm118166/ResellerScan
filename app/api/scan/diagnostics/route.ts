import { NextResponse } from "next/server";

import {
  isSupportedSymbology,
  planBarcodeLookup,
  type BarcodeSymbology,
} from "@/lib/barcode";
import { EbayError } from "@/lib/ebay";
import { executeBarcodePlan } from "@/lib/lookup";
import { buildScanResponse } from "@/lib/scan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_BARCODE_BODY = {
  error: "Invalid barcode",
  detail: "Expected a valid UPC-A, EAN-13, EAN-8, or UPC-E value.",
};

/**
 * Diagnostics are available only outside production, or in production when a
 * matching secret x-diagnostics-token is supplied. Set
 * SCAN_DIAGNOSTICS_ENABLED=false to hard-disable non-production diagnostics.
 */
function isAuthorized(request: Request): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  const expectedToken = process.env.SCAN_DIAGNOSTICS_TOKEN?.trim();
  const suppliedToken = request.headers.get("x-diagnostics-token")?.trim();

  if (!isProduction && process.env.SCAN_DIAGNOSTICS_ENABLED !== "false") {
    return true;
  }
  return Boolean(expectedToken && suppliedToken && suppliedToken === expectedToken);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const rawBarcode = searchParams.get("upc") ?? searchParams.get("barcode");
  const symbologyParam = searchParams.get("symbology");

  let symbology: BarcodeSymbology = "UNKNOWN";
  if (symbologyParam != null && symbologyParam.length > 0) {
    if (!isSupportedSymbology(symbologyParam)) {
      return NextResponse.json(
        {
          error: "Unsupported symbology",
          detail: "symbology must be one of UPC_A, UPC_E, EAN_13, EAN_8, or UNKNOWN.",
        },
        { status: 400 },
      );
    }
    symbology = symbologyParam;
  }

  const plan = planBarcodeLookup(rawBarcode, symbology);
  if (!plan.valid) {
    return NextResponse.json(INVALID_BARCODE_BODY, { status: 400 });
  }

  try {
    const executed = await executeBarcodePlan(plan);
    const { response, candidates, newFloor, usedFloor } = buildScanResponse({
      barcodeResolution: executed.barcodeResolution,
      items: executed.items,
      rawResultCount: executed.rawResultCount,
      resultSetTruncated: executed.resultSetTruncated,
      lookupAttempts: executed.lookupAttempts,
    });

    const candidateDiagnostics = candidates.slice(0, 30).map((candidate) => ({
      itemId: candidate.itemId,
      title: candidate.title,
      itemPrice: candidate.itemPrice,
      shippingPrice: candidate.shippingPrice,
      condition: candidate.condition,
      conditionGroup: candidate.conditionGroup,
      buyingOptions: candidate.buyingOptions,
      eligibleForDisplay: candidate.eligibleForDisplay,
      eligibleForPricing: candidate.eligibleForPricing,
      rejectionRuleIDs: candidate.rejectionRuleIDs,
      selectedAsNewFloor: newFloor?.itemId === candidate.itemId,
      selectedAsUsedFloor: usedFloor?.itemId === candidate.itemId,
    }));

    return NextResponse.json({
      queryMode: response.queryMode,
      barcodeResolution: response.barcodeResolution,
      lookupAttempts: response.lookupAttempts,
      counts: response.counts,
      excludedConditionCounts: response.excludedConditionCounts,
      conditionResults: response.conditionResults,
      candidates: candidateDiagnostics,
    });
  } catch (error) {
    if (error instanceof EbayError) {
      return NextResponse.json(
        {
          error: "Upstream marketplace error",
          detail: "eBay market data is temporarily unavailable.",
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
