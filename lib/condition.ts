// Centralized eBay condition mapping.
//
// A listing is assigned to exactly one ConditionGroup. Only NEW and USED are
// currently included in pricing. OPEN_BOX, NEW_WITH_DEFECTS, REFURBISHED,
// FOR_PARTS, and UNKNOWN are returned as excluded-condition counts so the app
// never silently mixes them into New or Used prices.
//
// eBay condition ID 1500 is category-dependent. Its display label can represent
// Open box, New other, New without tags, and similar states, so the structured
// label is required to refine that ID safely.

export type ConditionGroup =
  | "NEW"
  | "USED"
  | "OPEN_BOX"
  | "NEW_WITH_DEFECTS"
  | "REFURBISHED"
  | "FOR_PARTS"
  | "UNKNOWN";

/** Condition groups that participate in the priced New/Used partitions. */
export const PRICED_CONDITION_GROUPS: ReadonlySet<ConditionGroup> = new Set([
  "NEW",
  "USED",
]);

// eBay US condition IDs with an unambiguous high-level mapping.
// ID 1500 is handled separately because its display label varies by category.
const CONDITION_ID_MAP: Record<number, ConditionGroup> = {
  1000: "NEW",
  1750: "NEW_WITH_DEFECTS",
  2000: "REFURBISHED",
  2010: "REFURBISHED",
  2020: "REFURBISHED",
  2030: "REFURBISHED",
  2500: "REFURBISHED",
  2750: "USED",
  2990: "USED",
  3000: "USED",
  3010: "USED",
  4000: "USED",
  5000: "USED",
  6000: "USED",
  7000: "FOR_PARTS",
};

function normalizedText(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function padded(raw: string): string {
  return ` ${normalizedText(raw).replace(/-/g, " ").replace(/\s+/g, " ").trim()} `;
}

function hasPhrase(text: string, phrase: string): boolean {
  return text.includes(` ${phrase} `);
}

/**
 * Map a structured condition label, or as a last resort title text, to a group.
 * Whole-word/whole-phrase checks avoid false matches such as "Fairy" => "fair".
 */
function mapConditionText(raw: string): ConditionGroup {
  const normalized = normalizedText(raw);
  const text = padded(raw);
  if (!normalized) return "UNKNOWN";

  if (
    hasPhrase(text, "for parts") ||
    hasPhrase(text, "not working") ||
    hasPhrase(text, "does not work") ||
    hasPhrase(text, "doesn t work")
  ) {
    return "FOR_PARTS";
  }

  if (
    hasPhrase(text, "new with defects") ||
    hasPhrase(text, "factory second") ||
    hasPhrase(text, "factory seconds")
  ) {
    return "NEW_WITH_DEFECTS";
  }

  if (hasPhrase(text, "open box")) return "OPEN_BOX";

  if (
    hasPhrase(text, "certified refurbished") ||
    hasPhrase(text, "seller refurbished") ||
    hasPhrase(text, "manufacturer refurbished") ||
    hasPhrase(text, "remanufactured") ||
    normalized.includes("refurb")
  ) {
    return "REFURBISHED";
  }

  // "Like New" is a used-family condition and must be checked before New.
  if (hasPhrase(text, "like new")) return "USED";

  if (
    hasPhrase(text, "pre owned") ||
    hasPhrase(text, "preowned") ||
    hasPhrase(text, "used") ||
    hasPhrase(text, "very good") ||
    hasPhrase(text, "acceptable") ||
    normalized === "fair" ||
    normalized.startsWith("fair -") ||
    normalized === "good" ||
    normalized.startsWith("good -")
  ) {
    return "USED";
  }

  if (
    hasPhrase(text, "brand new") ||
    hasPhrase(text, "factory sealed") ||
    hasPhrase(text, "new with box") ||
    hasPhrase(text, "new with tags") ||
    hasPhrase(text, "new without box") ||
    hasPhrase(text, "new without tags") ||
    hasPhrase(text, "new other") ||
    normalized === "new" ||
    normalized.startsWith("new -")
  ) {
    return "NEW";
  }

  return "UNKNOWN";
}

export type ConditionInput = {
  conditionId?: string;
  /** eBay's structured condition label, such as "Brand New" or "Used". */
  conditionLabel?: string;
  /** Listing title, used only when no structured condition data exists. */
  titleFallback?: string;
};

/**
 * Resolve a listing's condition group.
 *
 * Rules:
 * - ID 1500 is refined by its condition label because it can mean New Other,
 *   New Without Tags/Box, or Open Box depending on category.
 * - Other recognized IDs are authoritative.
 * - The structured condition label is next.
 * - The title is used only when no structured condition data exists.
 */
export function mapCondition(input: ConditionInput): ConditionGroup {
  const label = input.conditionLabel?.trim();
  const id = input.conditionId ? Number.parseInt(input.conditionId, 10) : Number.NaN;

  if (id === 1500) {
    if (label) {
      const labelGroup = mapConditionText(label);
      if (labelGroup !== "UNKNOWN") return labelGroup;
    }

    // A bare 1500 cannot safely be called ordinary New because eBay also uses
    // it for Open Box. Exclude it from New/Used pricing unless the label clarifies.
    return "OPEN_BOX";
  }

  if (!Number.isNaN(id) && CONDITION_ID_MAP[id]) {
    return CONDITION_ID_MAP[id];
  }

  if (label) return mapConditionText(label);
  if (input.titleFallback?.trim()) return mapConditionText(input.titleFallback);
  return "UNKNOWN";
}
