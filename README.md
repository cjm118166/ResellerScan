# ResellerScan Backend

Next.js/Vercel backend for ResellerScan. It validates retail barcodes, performs strict eBay Browse API GTIN lookups, applies deterministic listing exclusions, and returns separate New and Used pricing results.

## What this version includes

- UPC-A, UPC-E, EAN-13, and EAN-8 validation with checksum verification
- Symbology-aware UPC-E expansion
- Controlled raw EAN-8 then UPC-E fallback for unknown 8-digit manual entry
- Strict `gtin` eBay Browse API lookup with no keyword fallback
- US marketplace, USD, and US-deliverable listing filtering
- Separate New and Used listing counts, prices, fees, payouts, titles, images, and URLs
- Conservative Open Box, New with defects, Refurbished, For Parts, and Unknown separation
- Complete-product exclusions for cases, boxes, manuals, digital codes, lots, bundles, and incomplete video games
- Same listing used for the displayed result and its floor price within each condition
- In-process OAuth token caching, snapshot caching, rate limiting, and guarded diagnostics
- Backward-compatible legacy fields for New results

## Requirements

- Node.js 20.9+
- pnpm 10
- eBay production application credentials with Browse API access

## Environment variables

Copy `.env.example` to `.env.local` for local development and supply:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`

Optional diagnostics variables:

- `SCAN_DIAGNOSTICS_ENABLED`
- `SCAN_DIAGNOSTICS_TOKEN`

Never commit real credentials.

## Install and verify

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
pnpm verify
```

Or run the steps individually:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Run locally

```bash
pnpm dev
```

## API

### Scan

```http
GET /api/scan?upc=045496590581&symbology=UPC_A
```

Supported symbology values:

- `UPC_A`
- `UPC_E`
- `EAN_13`
- `EAN_8`
- `UNKNOWN`

The response includes separate `conditionResults.new` and `conditionResults.used` objects. It also retains legacy New-only response fields when a New pricing result exists.

The fee estimate remains intentionally simple and disclosed to the app as 13.25% of the displayed item price plus $0.30. It is not category- or seller-plan-specific.

### Diagnostics

```http
GET /api/scan/diagnostics?upc=045496590581&symbology=UPC_A
```

Diagnostics are available automatically outside production unless disabled. In production, use a configured `SCAN_DIAGNOSTICS_TOKEN` in the `x-diagnostics-token` header. Do not expose this token in the iOS app.

## Deployment

1. Extract the ZIP.
2. Upload or push the extracted project files to GitHub. Do not upload the ZIP as the repository contents.
3. Connect the repository to Vercel, or push to the repository already connected to the Vercel project.
4. Add `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` in Vercel Project Settings → Environment Variables.
5. Deploy a preview branch first.
6. Test valid UPC-A, EAN-13, EAN-8, UPC-E, New-only, Used-only, and no-result responses before promoting to production.

GitHub Actions runs tests, type-checking, linting, and a production build on every push and pull request.
