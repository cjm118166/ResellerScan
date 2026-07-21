// Deterministic, phrase-based product-identity rejection rules.
// No AI / LLM. Every rule has a stable ID so diagnostics remain consistent.

export type RejectionRuleID =
  | "wrong_currency"
  | "missing_price"
  | "category_conflict"
  | "accessory_only"
  | "case_only"
  | "box_only"
  | "manual_only"
  | "replacement_packaging"
  | "digital_code_only"
  | "empty_package"
  | "parts_only"
  | "not_working"
  | "unmatched_bundle"
  | "unmatched_lot"
  | "auction_excluded"
  | "local_pickup_only"
  // Video-game specific (retail UPC scans).
  | "media_only_game";

/**
 * Normalize a title for whole-phrase, case-insensitive matching.
 * Punctuation and whitespace collapse to spaces, and padding prevents partial
 * word matches.
 */
export function normalizeText(input: string): string {
  const cleaned = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${cleaned} `;
}

const PHRASE_RULES: Array<{ id: RejectionRuleID; phrases: string[] }> = [
  {
    id: "case_only",
    phrases: ["case only", "replacement case", "cover art only", "artwork only"],
  },
  {
    id: "box_only",
    phrases: ["box only", "empty box", "replacement box"],
  },
  {
    id: "manual_only",
    phrases: ["manual only", "instructions only", "instruction manual only"],
  },
  {
    id: "replacement_packaging",
    phrases: ["replacement packaging", "replacement case", "replacement box"],
  },
  {
    id: "digital_code_only",
    phrases: ["digital code", "digital download", "code only", "download code"],
  },
  {
    id: "empty_package",
    phrases: ["empty box", "empty case", "no game", "no disc included"],
  },
  {
    id: "parts_only",
    phrases: ["for parts", "parts only", "parts or repair", "as is"],
  },
  {
    id: "not_working",
    phrases: ["not working", "does not work", "doesn t work", "non working"],
  },
  {
    id: "unmatched_bundle",
    phrases: ["bundle of", "bundle lot"],
  },
  {
    id: "unmatched_lot",
    phrases: ["lot of", "wholesale lot", "bulk lot"],
  },
  {
    // Keep this conservative. A scanned product can itself be a charger, cable,
    // stand, or strap, so those generic product names must not be rejected.
    id: "accessory_only",
    phrases: ["faceplate only", "skin only", "sticker only", "decal only"],
  },
];

// Applied only when the candidate set is identified as physical video games.
const GAME_MEDIA_ONLY_PHRASES = [
  "cartridge only",
  "cart only",
  "disc only",
  "disk only",
  "game only",
  "no case",
  "no manual",
];

function containsPhrase(normalizedTitle: string, phrase: string): boolean {
  return normalizedTitle.includes(` ${phrase} `);
}

export type RejectionContext = {
  title: string;
  /** Whether this scan is being treated as a physical video game retail UPC. */
  isVideoGame?: boolean;
};

/**
 * Return stable rule IDs triggered by a listing title.
 * Price, currency, buying-option, and category rules are applied later where
 * those structured values are available.
 */
export function evaluateTitleRejections(ctx: RejectionContext): RejectionRuleID[] {
  const normalized = normalizeText(ctx.title ?? "");
  const hits = new Set<RejectionRuleID>();

  for (const rule of PHRASE_RULES) {
    for (const phrase of rule.phrases) {
      if (containsPhrase(normalized, phrase)) {
        hits.add(rule.id);
        break;
      }
    }
  }

  if (ctx.isVideoGame) {
    for (const phrase of GAME_MEDIA_ONLY_PHRASES) {
      if (containsPhrase(normalized, phrase)) {
        hits.add("media_only_game");
        break;
      }
    }
  }

  return [...hits];
}
