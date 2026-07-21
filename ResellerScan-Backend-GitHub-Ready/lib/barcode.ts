// Barcode validation and symbology-aware resolution.
// Supports UPC-A, EAN-13, EAN-8, and UPC-E.
// No external dependencies; pure functions so they are trivially unit-testable.
//
// Barcode values are ALWAYS treated as strings so leading zeroes are preserved.

export type BarcodeType = "UPC_A" | "EAN_13" | "EAN_8" | "UPC_E";

/** Client-declared symbology (e.g. from the iOS scanner). UNKNOWN = manual entry. */
export type BarcodeSymbology = "UPC_A" | "UPC_E" | "EAN_13" | "EAN_8" | "UNKNOWN";

/** Concrete symbology the backend resolved the value to after validation. */
export type ResolvedBarcodeType = BarcodeType;

/** How a value was resolved. Only three modes exist by contract. */
export type ResolutionMode =
  | "CLIENT_SYMBOLOGY"
  | "RAW_EAN8"
  | "UPC_E_EXPANSION_FALLBACK";

export const SUPPORTED_SYMBOLOGIES: BarcodeSymbology[] = [
  "UPC_A",
  "UPC_E",
  "EAN_13",
  "EAN_8",
  "UNKNOWN",
];

export function isSupportedSymbology(value: string | null | undefined): value is BarcodeSymbology {
  return value != null && (SUPPORTED_SYMBOLOGIES as string[]).includes(value);
}

export type BarcodeValidationResult =
  | {
      valid: true;
      /** The canonical value used for the eBay GTIN lookup. UPC-E is expanded to UPC-A. */
      normalized: string;
      /** The original (trimmed) input value. */
      input: string;
      type: BarcodeType;
    }
  | {
      valid: false;
      reason: string;
    };

const DIGITS_ONLY = /^[0-9]+$/;

/**
 * Standard GS1 mod-10 check digit for UPC-A / EAN-13 / EAN-8.
 * Weights alternate 3/1 depending on position from the right, so the algorithm
 * is identical for every supported symbology.
 */
function computeGs1CheckDigit(dataDigits: number[]): number {
  let sum = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    const fromRight = dataDigits.length - 1 - i;
    const weight = fromRight % 2 === 0 ? 3 : 1;
    sum += dataDigits[i] * weight;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidGs1Checksum(code: string): boolean {
  if (!DIGITS_ONLY.test(code) || code.length < 2) return false;
  const digits = code.split("").map((c) => Number.parseInt(c, 10));
  const data = digits.slice(0, -1);
  const check = digits[digits.length - 1];
  return computeGs1CheckDigit(data) === check;
}

function isAllZero(code: string): boolean {
  return /^0+$/.test(code);
}

/** True when `code` is a structurally valid UPC-A (12 digits, valid checksum). */
export function isValidUpcA(code: string): boolean {
  return code.length === 12 && hasValidGs1Checksum(code);
}

/** True when `code` is a structurally valid EAN-13 (13 digits, valid checksum). */
export function isValidEan13(code: string): boolean {
  return code.length === 13 && hasValidGs1Checksum(code);
}

/** True when `code` is a structurally valid EAN-8 (8 digits, valid checksum). */
export function isValidEan8(code: string): boolean {
  return code.length === 8 && hasValidGs1Checksum(code);
}

/** True when `code` is a valid UPC-E (expandable, with a valid resulting UPC-A checksum). */
export function isValidUpcE(code: string): boolean {
  const expanded = expandUpcE(code);
  return expanded != null && hasValidGs1Checksum(expanded);
}

/**
 * Documented UPC-A-in-EAN-13 rule:
 * Apple's scanner sometimes reports a UPC-A as an EAN-13 with a single leading zero.
 * If an EAN-13 begins with '0' and its trailing 12 digits form a valid UPC-A, the
 * value is normalized to that 12-digit UPC-A. Leading zeroes are never stripped by
 * numeric conversion because everything is handled as strings.
 * Returns the 12-digit UPC-A, or null when the value does not reduce.
 */
export function ean13ToUpcA(code: string): string | null {
  if (code.length !== 13 || code[0] !== "0") return null;
  const candidate = code.slice(1);
  return isValidUpcA(candidate) ? candidate : null;
}

/**
 * Expand an 8-digit UPC-E value into its 12-digit UPC-A equivalent.
 * Returns null when the value cannot be expanded.
 * Format: [numberSystem(1)] [manufacturer/product(6)] [check(1)]
 */
export function expandUpcE(upce: string): string | null {
  if (upce.length !== 8 || !DIGITS_ONLY.test(upce)) return null;

  const numberSystem = upce[0];
  // UPC-E only supports number systems 0 and 1.
  if (numberSystem !== "0" && numberSystem !== "1") return null;

  const check = upce[7];
  const d = upce.slice(1, 7); // 6 data digits D1..D6
  const [d1, d2, d3, d4, d5, d6] = d.split("");

  let mfg = "";
  let prod = "";

  switch (d6) {
    case "0":
    case "1":
    case "2":
      mfg = `${d1}${d2}${d6}00`;
      prod = `00${d3}${d4}${d5}`;
      break;
    case "3":
      mfg = `${d1}${d2}${d3}00`;
      prod = `000${d4}${d5}`;
      break;
    case "4":
      mfg = `${d1}${d2}${d3}${d4}0`;
      prod = `0000${d5}`;
      break;
    default: // 5,6,7,8,9
      mfg = `${d1}${d2}${d3}${d4}${d5}`;
      prod = `0000${d6}`;
      break;
  }

  const upcA = `${numberSystem}${mfg}${prod}${check}`;
  if (upcA.length !== 12) return null;
  return upcA;
}

/**
 * Legacy auto-detect validator (kept for diagnostics/back-compat).
 * For ambiguous 8-digit values, it preserves the raw GTIN-8/EAN-8 representation.
 * Callers that know the scanner symbology must use `planBarcodeLookup`, which can
 * explicitly validate UPC-E and expand it to UPC-A.
 */
export function validateBarcode(raw: string | null | undefined): BarcodeValidationResult {
  if (raw == null) return { valid: false, reason: "empty" };

  const input = raw.trim();
  if (input.length === 0) return { valid: false, reason: "empty" };
  if (!DIGITS_ONLY.test(input)) return { valid: false, reason: "non_numeric" };
  if (isAllZero(input)) return { valid: false, reason: "all_zero_placeholder" };

  switch (input.length) {
    case 8: {
      if (isValidEan8(input)) {
        return { valid: true, normalized: input, input, type: "EAN_8" };
      }
      const expanded = expandUpcE(input);
      if (expanded && hasValidGs1Checksum(expanded)) {
        return { valid: true, normalized: expanded, input, type: "UPC_E" };
      }
      return { valid: false, reason: "invalid_checksum" };
    }
    case 12:
      return isValidUpcA(input)
        ? { valid: true, normalized: input, input, type: "UPC_A" }
        : { valid: false, reason: "invalid_checksum" };
    case 13:
      return isValidEan13(input)
        ? { valid: true, normalized: input, input, type: "EAN_13" }
        : { valid: false, reason: "invalid_checksum" };
    default:
      return { valid: false, reason: "unsupported_length" };
  }
}

// --- Symbology-aware resolution --------------------------------------------

/**
 * A single strict GTIN lookup the backend intends to perform.
 * `queryBarcode` is exactly what is sent to eBay's `gtin` parameter.
 */
export type LookupAttempt = {
  resolvedBarcode: string;
  queryBarcode: string;
  resolvedBarcodeType: ResolvedBarcodeType;
  resolutionMode: ResolutionMode;
  originalUPCE?: string;
  expandedUPCA?: string;
};

export type BarcodePlan =
  | {
      valid: true;
      inputBarcode: string;
      inputSymbology: BarcodeSymbology;
      /** Ordered attempts. Length > 1 only for UNKNOWN 8-digit (raw EAN-8 then UPC-E). */
      attempts: LookupAttempt[];
    }
  | { valid: false; reason: string };

function upcAAttempt(v: string, mode: ResolutionMode): LookupAttempt {
  return { resolvedBarcode: v, queryBarcode: v, resolvedBarcodeType: "UPC_A", resolutionMode: mode };
}

function ean13Attempt(v: string, mode: ResolutionMode): LookupAttempt {
  // Apply the documented leading-zero UPC-A reduction.
  const upcA = ean13ToUpcA(v);
  if (upcA) return upcAAttempt(upcA, mode);
  return { resolvedBarcode: v, queryBarcode: v, resolvedBarcodeType: "EAN_13", resolutionMode: mode };
}

function ean8Attempt(v: string, mode: ResolutionMode): LookupAttempt {
  return { resolvedBarcode: v, queryBarcode: v, resolvedBarcodeType: "EAN_8", resolutionMode: mode };
}

function upcEAttempt(v: string, mode: ResolutionMode): LookupAttempt {
  const expanded = expandUpcE(v)!;
  return {
    resolvedBarcode: expanded,
    queryBarcode: expanded,
    resolvedBarcodeType: "UPC_E",
    resolutionMode: mode,
    originalUPCE: v,
    expandedUPCA: expanded,
  };
}

/**
 * Plan the strict GTIN lookup(s) for a scanned/entered barcode.
 *
 * The client-declared symbology is a hint only: digits, length, and checksum are
 * always validated independently before any attempt is produced.
 *
 * Resolution rules:
 *  - UPC_A   -> 12 digits + checksum, query the 12-digit GTIN.
 *  - EAN_13  -> 13 digits + checksum, query the 13-digit GTIN (leading-zero values
 *               that reduce to a valid UPC-A are normalized to UPC-A).
 *  - EAN_8   -> 8 digits + EAN-8 checksum, query the raw 8-digit value (NOT expanded).
 *  - UPC_E   -> valid UPC-E, expand to UPC-A, query the UPC-A.
 *  - UNKNOWN -> length-directed: 12 => UPC_A, 13 => EAN_13, 8 => try raw EAN-8 first,
 *               then UPC-E expansion as a controlled fallback.
 */
export function planBarcodeLookup(
  raw: string | null | undefined,
  symbology: BarcodeSymbology = "UNKNOWN",
): BarcodePlan {
  if (raw == null) return { valid: false, reason: "empty" };
  const inputBarcode = raw.trim();
  if (inputBarcode.length === 0) return { valid: false, reason: "empty" };
  if (!DIGITS_ONLY.test(inputBarcode)) return { valid: false, reason: "non_numeric" };
  if (isAllZero(inputBarcode)) return { valid: false, reason: "all_zero_placeholder" };

  const ok = (attempts: LookupAttempt[]): BarcodePlan => ({
    valid: true,
    inputBarcode,
    inputSymbology: symbology,
    attempts,
  });

  switch (symbology) {
    case "UPC_A": {
      if (inputBarcode.length !== 12) return { valid: false, reason: "unsupported_length" };
      if (!isValidUpcA(inputBarcode)) return { valid: false, reason: "invalid_checksum" };
      return ok([upcAAttempt(inputBarcode, "CLIENT_SYMBOLOGY")]);
    }
    case "EAN_13": {
      if (inputBarcode.length !== 13) return { valid: false, reason: "unsupported_length" };
      if (!isValidEan13(inputBarcode)) return { valid: false, reason: "invalid_checksum" };
      return ok([ean13Attempt(inputBarcode, "CLIENT_SYMBOLOGY")]);
    }
    case "EAN_8": {
      if (inputBarcode.length !== 8) return { valid: false, reason: "unsupported_length" };
      if (!isValidEan8(inputBarcode)) return { valid: false, reason: "invalid_checksum" };
      return ok([ean8Attempt(inputBarcode, "CLIENT_SYMBOLOGY")]);
    }
    case "UPC_E": {
      if (inputBarcode.length !== 8) return { valid: false, reason: "unsupported_length" };
      if (!isValidUpcE(inputBarcode)) return { valid: false, reason: "invalid_checksum" };
      return ok([upcEAttempt(inputBarcode, "CLIENT_SYMBOLOGY")]);
    }
    case "UNKNOWN":
    default: {
      switch (inputBarcode.length) {
        case 12:
          if (!isValidUpcA(inputBarcode)) return { valid: false, reason: "invalid_checksum" };
          return ok([upcAAttempt(inputBarcode, "CLIENT_SYMBOLOGY")]);
        case 13:
          if (!isValidEan13(inputBarcode)) return { valid: false, reason: "invalid_checksum" };
          return ok([ean13Attempt(inputBarcode, "CLIENT_SYMBOLOGY")]);
        case 8: {
          const attempts: LookupAttempt[] = [];
          // Controlled resolution: try raw EAN-8 first, then UPC-E expansion.
          if (isValidEan8(inputBarcode)) attempts.push(ean8Attempt(inputBarcode, "RAW_EAN8"));
          if (isValidUpcE(inputBarcode)) {
            attempts.push(upcEAttempt(inputBarcode, "UPC_E_EXPANSION_FALLBACK"));
          }
          if (attempts.length === 0) return { valid: false, reason: "invalid_checksum" };
          return ok(attempts);
        }
        default:
          return { valid: false, reason: "unsupported_length" };
      }
    }
  }
}
