// Candidate normalization, eligibility filtering, deduplication, and floor selection.

import { evaluateTitleRejections } from "./rejection-rules";
import {
  mapCondition,
  PRICED_CONDITION_GROUPS,
  type ConditionGroup,
} from "./condition";

export type { ConditionGroup } from "./condition";

export type BuyingOption =
  | "FIXED_PRICE"
  | "AUCTION"
  | "BEST_OFFER"
  | "LOCAL_PICKUP"
  | "UNKNOWN";

export type Candidate = {
  itemId: string;
  title: string;
  url: string;
  imageURL?: string;

  itemPrice: number;
  shippingPrice?: number;
  currency: string;

  condition?: string;
  conditionGroup: ConditionGroup;

  buyingOptions: BuyingOption[];

  categoryId?: string;
  categoryPath?: string[];
  aspects?: Record<string, string[]>;

  eligibleForDisplay: boolean;
  eligibleForPricing: boolean;
  rejectionRuleIDs: string[];
};

const EXPECTED_CURRENCY = "USD";

/** Normalize eBay buyingOptions into the app's stable enum. */
export function toBuyingOptions(raw: string[] | undefined): BuyingOption[] {
  const out = new Set<BuyingOption>();

  for (const option of raw ?? []) {
    switch (option) {
      case "FIXED_PRICE":
        out.add("FIXED_PRICE");
        break;
      case "AUCTION":
        out.add("AUCTION");
        break;
      case "BEST_OFFER":
        out.add("BEST_OFFER");
        break;
      case "LOCAL_PICKUP":
        // Kept for forward compatibility if an upstream adapter supplies an
        // explicit pickup-only buying option. We do not infer this merely from
        // pickupOptions being present or shippingOptions being absent.
        out.add("LOCAL_PICKUP");
        break;
      default:
        out.add("UNKNOWN");
    }
  }

  if (out.size === 0) out.add("UNKNOWN");
  return [...out];
}

/** Canonicalize aspect keys and values for stable downstream matching. */
export function canonicalizeAspects(
  aspects: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!aspects) return undefined;

  const out: Record<string, string[]> = {};
  for (const [rawKey, rawValues] of Object.entries(aspects)) {
    const key = rawKey
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!key) continue;

    const values = (Array.isArray(rawValues) ? rawValues : [rawValues])
      .map((value) => String(value).normalize("NFKC").trim())
      .filter(Boolean);

    if (values.length === 0) continue;
    out[key] = [...new Set([...(out[key] ?? []), ...values])];
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export type RawEbayItem = {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{
    shippingCost?: { value?: string; currency?: string };
    type?: string;
  }>;
  // eBay may return pickupOptions only for certain search contexts. Its presence
  // or absence is not used to infer pickup-only eligibility in normal GTIN search.
  pickupOptions?: Array<{ pickupLocationType?: string }>;
  condition?: string;
  conditionId?: string;
  buyingOptions?: string[];
  categories?: Array<{ categoryId?: string; categoryName?: string }>;
  categoryPath?: string;
  localizedAspects?: Array<{ name?: string; value?: string }>;
};

function parseShipping(item: RawEbayItem): number | undefined {
  const options = item.shippingOptions;
  if (!options || options.length === 0) return undefined;

  let minimum: number | undefined;
  for (const option of options) {
    const amount = option.shippingCost;
    if (!amount?.value) continue;
    if (amount.currency && amount.currency !== EXPECTED_CURRENCY) continue;

    const parsed = Number.parseFloat(amount.value);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    if (minimum === undefined || parsed < minimum) minimum = parsed;
  }

  return minimum;
}

function aspectsFromLocalized(item: RawEbayItem): Record<string, string[]> | undefined {
  if (!item.localizedAspects || item.localizedAspects.length === 0) return undefined;

  const grouped: Record<string, string[]> = {};
  for (const aspect of item.localizedAspects) {
    if (!aspect.name) continue;
    (grouped[aspect.name] ??= []).push(aspect.value ?? "");
  }
  return canonicalizeAspects(grouped);
}

export type NormalizeOptions = {
  isVideoGame?: boolean;
  /** Category IDs known to conflict with the scanned product, if any. */
  conflictingCategoryIds?: string[];
};

/** Normalize one raw eBay item and apply deterministic eligibility rules. */
export function normalizeCandidate(
  item: RawEbayItem,
  options: NormalizeOptions = {},
): Candidate | null {
  const itemId = (item.itemId ?? item.legacyItemId ?? "").trim();
  if (!itemId) return null;

  const title = (item.title ?? "").normalize("NFKC").trim();
  const currency = (item.price?.currency ?? "").trim().toUpperCase();
  const parsedPrice = item.price?.value == null
    ? Number.NaN
    : Number.parseFloat(item.price.value);
  const itemPrice = Number.isFinite(parsedPrice) ? parsedPrice : Number.NaN;

  const conditionGroup = mapCondition({
    conditionId: item.conditionId,
    conditionLabel: item.condition,
    titleFallback: title,
  });
  const buyingOptions = toBuyingOptions(item.buyingOptions);
  const shippingPrice = parseShipping(item);

  const categoryId = item.categories?.[0]?.categoryId;
  const categoryPath = item.categoryPath
    ? item.categoryPath.split("|").map((part) => part.trim()).filter(Boolean)
    : item.categories?.map((category) => category.categoryName ?? "").filter(Boolean);

  const rejectionRuleIDs = new Set<string>(
    evaluateTitleRejections({
      title,
      isVideoGame: options.isVideoGame,
    }),
  );

  if (!currency || currency !== EXPECTED_CURRENCY) {
    rejectionRuleIDs.add("wrong_currency");
  }
  if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
    rejectionRuleIDs.add("missing_price");
  }
  if (conditionGroup === "FOR_PARTS") {
    rejectionRuleIDs.add("parts_only");
  }
  if (buyingOptions.includes("AUCTION") && !buyingOptions.includes("FIXED_PRICE")) {
    rejectionRuleIDs.add("auction_excluded");
  }
  if (buyingOptions.includes("LOCAL_PICKUP")) {
    rejectionRuleIDs.add("local_pickup_only");
  }
  if (
    options.conflictingCategoryIds &&
    categoryId &&
    options.conflictingCategoryIds.includes(categoryId)
  ) {
    rejectionRuleIDs.add("category_conflict");
  }

  const ids = [...rejectionRuleIDs].sort();

  // Display eligibility means the listing appears to be the same physical
  // product. Pure pricing-format problems do not hide an otherwise relevant
  // active listing from the matched count.
  const pricingOnlyRules = new Set([
    "wrong_currency",
    "missing_price",
    "auction_excluded",
    "local_pickup_only",
  ]);
  const identityRejections = ids.filter((id) => !pricingOnlyRules.has(id));
  const eligibleForDisplay = identityRejections.length === 0;

  const eligibleForPricing =
    eligibleForDisplay &&
    ids.length === 0 &&
    currency === EXPECTED_CURRENCY &&
    Number.isFinite(itemPrice) &&
    itemPrice > 0 &&
    buyingOptions.includes("FIXED_PRICE") &&
    !buyingOptions.includes("LOCAL_PICKUP") &&
    PRICED_CONDITION_GROUPS.has(conditionGroup);

  return {
    itemId,
    title,
    url: item.itemWebUrl ?? "",
    imageURL: item.image?.imageUrl,
    itemPrice: Number.isFinite(itemPrice) ? itemPrice : 0,
    shippingPrice,
    currency,
    condition: item.condition,
    conditionGroup,
    buyingOptions,
    categoryId,
    categoryPath,
    aspects: aspectsFromLocalized(item),
    eligibleForDisplay,
    eligibleForPricing,
    rejectionRuleIDs: ids,
  };
}

/** Deduplicate candidates by marketplace and itemId, keeping the first. */
export function dedupeCandidates(candidates: Candidate[], marketplace: string): Candidate[] {
  const seen = new Set<string>();
  const deduped: Candidate[] = [];

  for (const candidate of candidates) {
    const key = `${marketplace}::${candidate.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

const CONDITION_COMPLETENESS: Record<ConditionGroup, number> = {
  NEW: 6,
  OPEN_BOX: 5,
  NEW_WITH_DEFECTS: 4,
  REFURBISHED: 3,
  USED: 2,
  FOR_PARTS: 1,
  UNKNOWN: 0,
};

function compareForFloor(a: Candidate, b: Candidate): number {
  if (a.itemPrice !== b.itemPrice) return a.itemPrice - b.itemPrice;

  // Known shipping is a deterministic tie-breaker only. The V1 floor remains
  // item-price-only and never silently includes shipping.
  const aShippingRank = a.shippingPrice !== undefined ? 0 : 1;
  const bShippingRank = b.shippingPrice !== undefined ? 0 : 1;
  if (aShippingRank !== bShippingRank) return aShippingRank - bShippingRank;

  const aConditionRank = CONDITION_COMPLETENESS[a.conditionGroup];
  const bConditionRank = CONDITION_COMPLETENESS[b.conditionGroup];
  if (aConditionRank !== bConditionRank) return bConditionRank - aConditionRank;

  const aDataCompleteness = (a.title ? 1 : 0) + (a.imageURL ? 1 : 0) + (a.url ? 1 : 0);
  const bDataCompleteness = (b.title ? 1 : 0) + (b.imageURL ? 1 : 0) + (b.url ? 1 : 0);
  if (aDataCompleteness !== bDataCompleteness) {
    return bDataCompleteness - aDataCompleteness;
  }

  return a.itemId.localeCompare(b.itemId);
}

/** Select the cheapest pricing-eligible candidate across all priced groups. */
export function selectFloorListing(candidates: Candidate[]): Candidate | null {
  const eligible = candidates.filter((candidate) => candidate.eligibleForPricing);
  return eligible.length > 0 ? [...eligible].sort(compareForFloor)[0] : null;
}

/** Select the cheapest pricing-eligible candidate for New or Used only. */
export function selectFloorListingForGroup(
  candidates: Candidate[],
  group: "NEW" | "USED",
): Candidate | null {
  const eligible = candidates.filter(
    (candidate) => candidate.eligibleForPricing && candidate.conditionGroup === group,
  );
  return eligible.length > 0 ? [...eligible].sort(compareForFloor)[0] : null;
}
