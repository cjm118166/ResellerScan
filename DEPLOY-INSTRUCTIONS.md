# GitHub and Vercel deployment checklist

This folder is ready to use as the repository root.

1. Extract the ZIP.
2. Commit the extracted files to the GitHub repository connected to the Vercel project.
3. Do not commit `.env`, `.env.local`, eBay credentials, or diagnostics tokens.
4. In Vercel, confirm these environment variables exist for Preview and Production:
   - `EBAY_CLIENT_ID`
   - `EBAY_CLIENT_SECRET`
5. Optional diagnostics configuration:
   - `SCAN_DIAGNOSTICS_ENABLED=false`
   - `SCAN_DIAGNOSTICS_TOKEN=<strong secret>`
6. Push to a non-production branch first and let Vercel create a Preview deployment.
7. Confirm the GitHub Actions CI workflow passes.
8. Test the preview API before merging:

```text
/api/scan?upc=045496590581&symbology=UPC_A
/api/scan?upc=4006381333931&symbology=EAN_13
```

9. Confirm invalid values such as `abc` and `123` return HTTP 400.
10. Confirm the iOS client has been updated to decode `conditionResults.new` and `conditionResults.used` before promoting this backend to production.

Local verification commands:

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
pnpm verify
```
