# Verification performed for this ZIP

The following checks were completed before packaging:

- All TypeScript and TSX files passed a TypeScript syntax/transpile check.
- Backend libraries, API routes, and tests passed strict TypeScript checking with local declarations for framework-only modules.
- 41 bundled unit/fixture tests passed in a local lightweight test runner.
- The project contains one package-manager lockfile: `pnpm-lock.yaml`.
- `package-lock.json`, `.vercel`, `.next`, `node_modules`, real environment files, and credentials are excluded.
- Barcode lookup uses the eBay Browse API `gtin` parameter with no keyword fallback.
- New and Used results are computed separately.
- Unknown 8-digit manual entry tries raw EAN-8 first and only uses UPC-E expansion when the first attempt has no pricing-eligible New/Used result.

A real `pnpm install`, official Vitest run, Next.js build, and live eBay request could not be executed in the packaging environment because package-registry access and production eBay credentials were unavailable. The included GitHub Actions workflow performs the official install, tests, type-check, lint, and build on GitHub.
