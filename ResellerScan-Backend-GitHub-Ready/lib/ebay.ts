// eBay Browse API client: application OAuth token + strict GTIN search.
// Credentials remain server-side and are never returned to callers.

import type { RawEbayItem } from "./candidates";

const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const MARKETPLACE = "EBAY_US" as const;
const DELIVERY_COUNTRY = "US" as const;
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_SEARCH_LIMIT = 200;

export class EbayError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EbayError";
    this.status = status;
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new EbayError("eBay request timed out", 503);
    }
    throw new EbayError("eBay request failed", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function requestAppToken(): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new EbayError("eBay credentials are not configured", 500);
  }

  const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithTimeout(
    EBAY_OAUTH_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authorization}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
    },
    UPSTREAM_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new EbayError("eBay authentication failed", 502);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new EbayError("eBay authentication returned no token", 502);
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7_200) * 1_000,
  };
  return cachedToken.token;
}

export async function getAppToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  if (forceRefresh) {
    cachedToken = null;
    tokenRequest = null;
  }

  // Collapse concurrent cold-start token requests into one upstream call.
  if (!tokenRequest) {
    tokenRequest = requestAppToken().finally(() => {
      tokenRequest = null;
    });
  }
  return tokenRequest;
}

export type GtinSearchResult = {
  items: RawEbayItem[];
  rawResultCount?: number;
  resultSetTruncated: boolean;
};

async function performSearch(
  normalizedBarcode: string,
  limit: number,
  token: string,
): Promise<Response> {
  const params = new URLSearchParams({
    gtin: normalizedBarcode,
    limit: String(limit),
    // Keep results relevant to the current US-only app and exclude listings that
    // cannot be delivered to the United States.
    filter: `deliveryCountry:${DELIVERY_COUNTRY}`,
  });

  return fetchWithTimeout(
    `${EBAY_BROWSE_SEARCH_URL}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
        Accept: "application/json",
      },
    },
    UPSTREAM_TIMEOUT_MS,
  );
}

/**
 * Strict GTIN search. No q= keyword fallback is ever used.
 *
 * One page of at most 200 ItemSummary records is fetched. resultSetTruncated
 * reports when eBay's total exceeds the fetched records so callers do not treat
 * the sample as exhaustive.
 */
export async function searchByGtin(
  normalizedBarcode: string,
  requestedLimit = MAX_SEARCH_LIMIT,
): Promise<GtinSearchResult> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_SEARCH_LIMIT);

  let token = await getAppToken();
  let response = await performSearch(normalizedBarcode, limit, token);

  // Retry once with a fresh application token if the cached token was rejected.
  if (response.status === 401 || response.status === 403) {
    token = await getAppToken(true);
    response = await performSearch(normalizedBarcode, limit, token);
  }

  if (response.status === 401 || response.status === 403) {
    throw new EbayError("eBay authorization rejected", 502);
  }
  if (response.status === 429) {
    throw new EbayError("eBay rate limit exceeded", 503);
  }
  if (response.status >= 500) {
    throw new EbayError("eBay upstream error", 502);
  }
  if (!response.ok) {
    throw new EbayError("eBay search failed", 502);
  }

  const data = (await response.json()) as {
    itemSummaries?: RawEbayItem[];
    total?: number;
  };
  const items = data.itemSummaries ?? [];
  const rawResultCount = typeof data.total === "number" ? data.total : undefined;

  return {
    items,
    rawResultCount,
    resultSetTruncated:
      typeof rawResultCount === "number" && rawResultCount > items.length,
  };
}

export const EBAY_MARKETPLACE = MARKETPLACE;
