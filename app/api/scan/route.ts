import { NextResponse } from "next/server";

import {
  isSupportedSymbology,
  planBarcodeLookup,
  type BarcodeSymbology,
} from "@/lib/barcode";
import {
  buildCacheKey,
  checkRateLimit,
  getCached,
  setCached,
  SNAPSHOT_TTL_MS,
} from "@/lib/cache";
import { EbayError, EBAY_MARKETPLACE } from "@/lib/ebay";
import { executeBarcodePlan } from "@/lib/lookup";
import { buildScanResponse, type ScanResponse } from "@/lib/scan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_BARCODE_BODY = {
  error: "Invalid barcode",
  detail: "Expected a valid UPC-A, EAN-13, EAN-8, or UPC-E value.",
};

const UNSUPPORTED_SYMBOLOGY_BODY = {
  error: "Unsupported symbology",
  detail: "symbology must be one of UPC_A, UPC_E, EAN_13, EAN_8, or UNKNOWN.",
};

function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawBarcode = searchParams.get("upc") ?? searchParams.get("barcode");
  const symbologyParam = searchParams.get("symbology");

  // Rate-limit before validation so invalid/ambiguous requests cannot bypass it.
  if (!checkRateLimit(clientIdentifier(request))) {
    return NextResponse.json(
      {
        error: "Too many requests",
        detail: "Please slow down and try again shortly.",
      },
      { status: 429 },
    );
  }

  let symbology: BarcodeSymbology = "UNKNOWN";
  if (symbologyParam != null && symbologyParam.length > 0) {
    if (!isSupportedSymbology(symbologyParam)) {
      return NextResponse.json(UNSUPPORTED_SYMBOLOGY_BODY, { status: 400 });
    }
    symbology = symbologyParam;
  }

  const plan = planBarcodeLookup(rawBarcode, symbology);
  if (!plan.valid) {
    return NextResponse.json(INVALID_BARCODE_BODY, { status: 400 });
  }

  // Known symbologies cache by their resolved GTIN. Ambiguous manual 8-digit
  // input caches by the raw value because the selected interpretation is known
  // only after the controlled lookup sequence completes.
  const singleAttempt = plan.attempts.length === 1 ? plan.attempts[0] : undefined;
  const cacheBarcode = singleAttempt
    ? singleAttempt.resolvedBarcode
    : `UNKNOWN8:${plan.inputBarcode}`;
  const cacheType = singleAttempt
    ? singleAttempt.resolvedBarcodeType
    : "UNKNOWN8";
  const cacheKey = buildCacheKey(cacheBarcode, cacheType, EBAY_MARKETPLACE);

  const cached = getCached<ScanResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const executed = await executeBarcodePlan(plan);
    const { response } = buildScanResponse({
      barcodeResolution: executed.barcodeResolution,
      items: executed.items,
      rawResultCount: executed.rawResultCount,
      resultSetTruncated: executed.resultSetTruncated,
      lookupAttempts: executed.lookupAttempts,
    });

    setCached(cacheKey, response, SNAPSHOT_TTL_MS);
    return NextResponse.json(response);
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
      {
        error: "Internal Server Error",
        detail: "Unexpected failure processing the scan.",
      },
      { status: 500 },
    );
  }
}
