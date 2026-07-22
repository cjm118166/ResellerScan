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
  // Video-game specific: physical retail UPC scans.
  | "media_only_game";

/**
 * Normalize text for deterministic phrase matching.
 *
 * Examples:
 * - "COVER ART / CASE" -> " cover art case "
 * - "Cover-Art + Case" -> " cover art case "
 * - "Case w/ Cover Art" -> " case w cover art "
 *
 * Padding enables whole-phrase matching without partial-word collisions.
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

type PhraseRule = {
  id: RejectionRuleID;
  phrases: readonly string[];
};

/**
 * Rules safe enough to apply across product categories.
 *
 * Packaging-specific rules are intentionally scoped to video games below.
 * Otherwise, a legitimate product such as a phone case or display case could
 * be incorrectly rejected merely because its title contains "case".
 */
const GENERAL_PHRASE_RULES: readonly PhraseRule[] = [
  {
    id: "digital_code_only",
    phrases: [
      "digital code only",
      "download code only",
      "code only",
      "digital download only",
      "digital download code",
      "download code",
      "digital code",
    ],
  },
  {
    id: "parts_only",
    phrases: [
      "for parts",
      "parts only",
      "parts or repair",
      "parts repair",
      "repair only",
      "as is",
    ],
  },
  {
    id: "not_working",
    phrases: [
      "not working",
      "does not work",
      "doesn t work",
      "non working",
      "nonworking",
      "untested broken",
    ],
  },
  {
    id: "unmatched_bundle",
    phrases: [
      "bundle of",
      "bundle lot",
      "mixed bundle",
      "assorted bundle",
    ],
  },
  {
    id: "unmatched_lot",
    phrases: [
      "lot of",
      "wholesale lot",
      "bulk lot",
      "assorted lot",
      "mixed lot",
    ],
  },
  {
    // Keep this conservative. A scanned product may itself legitimately be a
    // charger, cable, stand, strap, or protective case.
    id: "accessory_only",
    phrases: [
      "faceplate only",
      "skin only",
      "sticker only",
      "decal only",
      "label only",
    ],
  },
];

/**
 * Packaging and incomplete-product rules applied only when the candidate set
 * has been identified as physical video games.
 */
const VIDEO_GAME_PHRASE_RULES: readonly PhraseRule[] = [
  {
    id: "case_only",
    phrases: [
      "case only",
      "game case only",
      "original case only",
      "case with cover art",
      "case w cover art",
      "cover art with case",
      "cover art and case",
      "case and cover art",
      "cover art case",
      "case cover art",
      "original case artwork",
      "original case art",
      "case artwork",
      "case art only",
      "replacement game case",
      "replacement case",
      "custom game case",
      "custom case",
      "reproduction case",
      "repro case",
      "empty case",
      "case no game",
      "case without game",
      "case game not included",
      "steelbook only",
      "steel book only",
      "sleeve only",
      "slipcover only",
      "slip cover only",
    ],
  },
  {
    id: "box_only",
    phrases: [
      "box only",
      "original box only",
      "retail box only",
      "empty box",
      "replacement box",
      "custom box",
      "reproduction box",
      "repro box",
      "packaging only",
      "box no game",
      "box without game",
      "box game not included",
    ],
  },
  {
    id: "manual_only",
    phrases: [
      "manual only",
      "instruction manual only",
      "instructions only",
      "booklet only",
      "manual no game",
      "manual without game",
      "manual game not included",
      "strategy guide only",
      "guide only",
    ],
  },
  {
    id: "replacement_packaging",
    phrases: [
      "replacement packaging",
      "replacement game case",
      "replacement case",
      "replacement box",
      "replacement sleeve",
      "replacement cover",
      "replacement cover art",
      "replacement artwork",
      "custom case",
      "custom box",
      "custom cover art",
      "reproduction case",
      "reproduction cover art",
      "repro case",
      "repro cover",
    ],
  },
  {
    id: "empty_package",
    phrases: [
      "empty box",
      "empty case",
      "no game",
      "no game included",
      "game not included",
      "without game",
      "no cartridge",
      "no cartridge included",
      "cartridge not included",
      "without cartridge",
      "no cart",
      "cart not included",
      "without cart",
      "no disc",
      "no disc included",
      "disc not included",
      "without disc",
      "missing disc",
      "missing cartridge",
      "missing cart",
    ],
  },
  {
    id: "accessory_only",
    phrases: [
      "cover art only",
      "artwork only",
      "printed cover art",
      "custom cover art",
      "reproduction cover art",
      "replacement cover art",
      "replacement artwork",
      "cover insert only",
      "case insert only",
      "poster only",
      "map only",
      "cartridge label",
      "cart label",
      "disc label",
    ],
  },
];

/**
 * Physical media that may be the actual game, but is incomplete for the
 * current complete-product pricing policy.
 */
const GAME_MEDIA_ONLY_PHRASES = [
  "cartridge only",
  "cart only",
  "disc only",
  "disk only",
  "game only",
  "loose cartridge",
  "loose cart",
  "loose disc",
  "loose disk",
  "no case",
  "without case",
  "case not included",
  "no manual",
  "without manual",
  "manual not included",
] as const;

/**
 * Explicit signals that the game/media is included with its packaging.
 *
 * These only prevent the broader token-combination heuristic below from
 * rejecting a title. They never override an explicit exclusion phrase such as
 * "game not included" or "case only".
 */
const GAME_INCLUDED_PHRASES = [
  "game included",
  "cartridge included",
  "cart included",
  "disc included",
  "complete in box",
  "complete with case",
  "complete game",
  "game and case",
  "case and game",
  "game with case",
  "case with game",
  "game cartridge with case",
  "cartridge with case",
  "cart with case",
  "disc with case",
  "cib",
  "factory sealed",
  "new sealed",
  "brand new sealed",
] as const;

function containsPhrase(normalizedTitle: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase).trim();
  return normalizedTitle.includes(` ${normalizedPhrase} `);
}

function containsAnyPhrase(
  normalizedTitle: string,
  phrases: readonly string[],
): boolean {
  return phrases.some((phrase) => containsPhrase(normalizedTitle, phrase));
}

function containsToken(normalizedTitle: string, token: string): boolean {
  return normalizedTitle.includes(` ${token} `);
}

function applyPhraseRules(
  normalizedTitle: string,
  rules: readonly PhraseRule[],
  hits: Set<RejectionRuleID>,
): void {
  for (const rule of rules) {
    if (containsAnyPhrase(normalizedTitle, rule.phrases)) {
      hits.add(rule.id);
    }
  }
}

/**
 * Detect packaging-only combinations that may not contain the literal word
 * "only".
 *
 * Example that must be rejected:
 * "Ultra Street Fighter II ... COVER ART / CASE Nintendo Switch"
 *
 * Example that must remain eligible:
 * "Ultra Street Fighter II Game Cartridge With Case"
 */
function applyVideoGameCombinationRules(
  normalizedTitle: string,
  hits: Set<RejectionRuleID>,
): void {
  const hasExplicitIncludedMedia = containsAnyPhrase(
    normalizedTitle,
    GAME_INCLUDED_PHRASES,
  );

  const hasExplicitMissingMedia = containsAnyPhrase(normalizedTitle, [
    "no game",
    "game not included",
    "without game",
    "no cartridge",
    "cartridge not included",
    "without cartridge",
    "no cart",
    "cart not included",
    "without cart",
    "no disc",
    "disc not included",
    "without disc",
  ]);

  const hasCase = containsToken(normalizedTitle, "case");
  const hasBox = containsToken(normalizedTitle, "box");
  const hasCoverArt =
    containsPhrase(normalizedTitle, "cover art") ||
    containsToken(normalizedTitle, "artwork");

  /*
   * A title containing both packaging and cover-art terms, but no explicit
   * indication that the actual game/media is included, is packaging-only.
   */
  if (hasCase && hasCoverArt && !hasExplicitIncludedMedia) {
    hits.add("case_only");
  }

  /*
   * Packaging plus an explicit missing-media statement is always rejected.
   * Explicit exclusion language overrides any generic inclusion-like words.
   */
  if ((hasCase || hasBox) && hasExplicitMissingMedia) {
    hits.add("empty_package");

    if (hasCase) {
      hits.add("case_only");
    }

    if (hasBox) {
      hits.add("box_only");
    }
  }
}

export type RejectionContext = {
  title: string;

  /**
   * Whether this candidate set represents physical video-game retail products.
   * Category-specific packaging and media rules are only applied when true.
   */
  isVideoGame?: boolean;
};

/**
 * Return stable rule IDs triggered by a listing title.
 *
 * Price, currency, buying-option, category, shipping, and condition rules are
 * applied later where those structured values are available.
 */
export function evaluateTitleRejections(
  ctx: RejectionContext,
): RejectionRuleID[] {
  const normalizedTitle = normalizeText(ctx.title ?? "");
  const hits = new Set<RejectionRuleID>();

  applyPhraseRules(normalizedTitle, GENERAL_PHRASE_RULES, hits);

  if (ctx.isVideoGame) {
    applyPhraseRules(normalizedTitle, VIDEO_GAME_PHRASE_RULES, hits);

    if (containsAnyPhrase(normalizedTitle, GAME_MEDIA_ONLY_PHRASES)) {
      hits.add("media_only_game");
    }

    applyVideoGameCombinationRules(normalizedTitle, hits);
  }

  return [...hits];
}
