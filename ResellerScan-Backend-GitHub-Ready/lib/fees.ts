// Centralized fee configuration and payout math for the V1 iOS contract.
// These are intentionally simple, non-category-specific estimates.

/** eBay final value fee percentage applied to the item price (V1 estimate). */
export const EBAY_FEE_PERCENT = 0.1325;

/** Fixed per-order fee in USD (V1 estimate). */
export const EBAY_FIXED_FEE = 0.3;

/** Round a monetary value to two decimal places, avoiding binary FP drift. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type FeeBreakdown = {
  /** Floor/item price the estimate is calculated from. */
  basePrice: number;
  estimatedFee: number;
  netPayout: number;
};

/**
 * Compute the estimated eBay fee and net payout from a base (floor) price.
 * All results are rounded to two decimals so the response reconciles exactly:
 *   basePrice - estimatedFee === netPayout
 */
export function calculateFees(basePrice: number): FeeBreakdown {
  const rounded = roundMoney(basePrice);
  const estimatedFee = roundMoney(rounded * EBAY_FEE_PERCENT + EBAY_FIXED_FEE);
  const netPayout = roundMoney(rounded - estimatedFee);
  return {
    basePrice: rounded,
    estimatedFee,
    netPayout,
  };
}
