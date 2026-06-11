# FuelFlow Release Checklist

Use this checklist for both preview and production releases. It reflects the current FuelFlow architecture: browser auth via Supabase, business data through `/api/*`, and server-side validation for calibration, sales, stock movements, and tanker unloading.

## 1. Environment Readiness

- Confirm `VITE_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` point to the same Supabase project for the target environment.
- Confirm `VITE_SUPABASE_ANON_KEY` matches the target Supabase project.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set only in server-side deployment settings.
- Confirm `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_AUTH_PROXY` are set for the target environment.
- Confirm `ALLOWED_ORIGINS` includes only the intended preview or production web origins.

## 2. Supabase Readiness

- Apply [01_rls_baseline.sql](file:///c:/Users/Praveen/Documents/FuelFlow/handoff/supabase/01_rls_baseline.sql) to the target Supabase project.
- If direct client reads are intentionally introduced, review and selectively apply statements from [02_optional_app_role_policies.sql](file:///c:/Users/Praveen/Documents/FuelFlow/handoff/supabase/02_optional_app_role_policies.sql).
- Verify RLS is enabled on:
  - `products`
  - `price_history`
  - `tanks`
  - `tank_calibration`
  - `dispensers`
  - `nozzles`
  - `meters`
  - `operators`
  - `shifts`
  - `bank_accounts`
  - `suppliers`
  - `tanker_unloading`
  - `stock_movements`
  - `sales`
  - `credit_sales`
  - `finance_transactions`
- Verify the service-role key is not exposed in frontend code, browser devtools, or public deployment settings.
- Confirm backups and point-in-time recovery expectations for the target Supabase project.

## 3. Auth And Redirects

- Confirm Supabase auth providers are configured for email/password and Google.
- Confirm Google OAuth redirect URIs include the deployed auth proxy and app callback locations.
- Confirm login, logout, and session restore work in the target environment.

## 4. API Hardening Checks

- Confirm `/api/*` routes are reachable only from intended origins when `ALLOWED_ORIGINS` is set.
- Confirm unknown resources return `404` from the shared API instead of falling through to arbitrary table access.
- Confirm specialized handlers still work:
  - tank calibration replace/read
  - sales create normalization
  - stock movement create/update validation
  - tanker unloading create/update validation

## 5. Functional Smoke Tests

- Login with email/password.
- Login with Google.
- Create or edit a product.
- Upload a tank calibration chart and confirm dip-to-volume returns expected values.
- Create a tanker unloading record.
- Create a stock movement record.
- Create a sales record and confirm total amount is computed correctly.
- Open Loss / Gain Analysis and verify results are populated.
- Open Finance and confirm records load from `finance_transactions` through `/api/finance`.
- Open Reports and Dashboard and confirm data loads without API errors.

## 6. Regression Checks

- Run:

```bash
npm test
npm run build
```

- Confirm there are no new diagnostics or type errors in edited files.
- Review the Vite bundle warning and confirm no unexpected size spike compared with the previous release.

## 7. Deployment Validation

- Confirm preview deployment uses preview env values and preview origins only.
- Confirm production deployment uses production env values and production origins only.
- Confirm `vercel.json` rewrites `/api/*` correctly in the deployed environment.
- Confirm serverless logs show no missing environment variable failures at startup.

## 8. Rollback Preparedness

- Keep the last known-good deployment available in Vercel.
- Keep the previous environment variable set retrievable.
- Confirm database backup/restore options before applying schema or policy changes.
- If a release fails after policy changes, revert the deployment first, then revert the SQL change set in a controlled window.
