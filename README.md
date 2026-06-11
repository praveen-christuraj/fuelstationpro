# FuelFlow

FuelFlow is a fuel station management application built with React, TypeScript, Vite, and Supabase. It covers master setup, operations, finance, bulk upload, analytics, and internal documentation for rollout planning.

## Current Status

- Web application: implemented and buildable
- Auth: Supabase email/password and Google sign-in
- Core modules: dashboard, master data, tanker unloading, dip-to-volume, sales, stock, finance, reports
- Backend style: Vercel serverless API backed by Supabase
- Mobile: documentation/reference only, not part of this repository

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Routing: React Router
- Auth and database: Supabase
- Icons and UI utilities: lucide-react, framer-motion
- Hosting model: Vite frontend plus Vercel `/api/*` functions
- Tests: lightweight Node test runner for focused regression coverage

## Repository Structure

```text
FuelFlow/
├─ api/                  Serverless API handlers and backend validators
├─ public/               Static assets
├─ src/
│  ├─ components/        Shared UI, CRUD tables, upload wizard, charts
│  ├─ contexts/          Auth context
│  ├─ lib/               API helpers, CSV utilities, shared business helpers
│  └─ pages/             Feature screens and in-app docs
├─ package.json
└─ vercel.json
```

## Implemented Modules

- Dashboard
- Master setup: products, tanks, dispensers, nozzles, meters, operators, shifts, bank accounts, suppliers, price history
- Operations: tanker unloading, dip-to-volume, stock movements, sales entry, loss/gain analysis
- Finance: credit sales and finance transactions
- Reports: sales trend and period analytics
- Bulk upload: sales, tank data, inventory
- In-app docs: project plan, backend notes, Android reference, testing/go-live notes

## Backend Notes

The backend currently uses a mixed approach:

- Generic CRUD handling for stable table-backed resources
- Specialized handlers for higher-risk flows:
  - tank calibration
  - sales creation
  - stock movement create/update
  - tanker unloading create/update
- Canonical table alias mapping where UI routes differ from DB naming:
  - `/api/finance` -> `finance_transactions`

This keeps existing screens stable while moving validation and integrity checks into the backend.

## Canonical Tables

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

## Required Environment Variables

### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_AUTH_PROXY`

### Serverless / Backend

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS` (optional, comma-separated production allowlist for browser origins)

Notes:

- The frontend Supabase client uses `VITE_*` values.
- The serverless API uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Vite is configured to expose both `VITE_*` and `NEXT_PUBLIC_*` prefixes.
- The API now fails fast if required client or server env vars are missing.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file such as `.env.local` and populate the required variables.

3. Start the app:

```bash
npm run dev
```

4. Validate changes before shipping:

```bash
npm test
npm run build
```

## Deployment Notes

- Frontend and API are intended for Vercel deployment.
- `vercel.json` rewrites `/api/*` requests to the shared API entrypoint.
- Supabase service-role access should be treated as privileged and only used in server-side runtime.
- The shared API now restricts requests to the known FuelFlow resource set instead of allowing arbitrary table access through the service-role client.
- Set `ALLOWED_ORIGINS` in production to limit browser access to trusted app origins. Leave it unset only for local development or controlled environments.
- RLS, backups, and monitoring should be verified in the target Supabase/Vercel environments before production rollout.

## Production Hardening Checklist

### Supabase RLS Review

- Enable RLS on all business tables.
- Allow direct client access only where the frontend truly needs anon/authenticated reads.
- Keep write-heavy or privileged flows behind the serverless API when they rely on service-role access.
- Verify that service-role usage is limited to server runtime only and never exposed to the browser bundle.
- Review policies specifically for:
  - `tanks`
  - `tank_calibration`
  - `sales`
  - `stock_movements`
  - `tanker_unloading`
  - `credit_sales`
  - `finance_transactions`

### Privileged API Usage Audit

- `/api/*` now runs behind an allowlisted resource surface.
- Higher-risk routes are specialized and validated server-side:
  - tank calibration
  - sales create
  - stock movement create/update
  - tanker unloading create/update
- Any future privileged route should be added intentionally rather than relying on generic table access.

### Environment And Deployment Validation

- Confirm all required env vars are set in Vercel for both preview and production.
- Configure `ALLOWED_ORIGINS` for deployed browser clients.
- Confirm Supabase project URL and keys match the intended environment.
- Validate auth redirect URIs for Google sign-in.
- Run before release:

```bash
npm test
npm run build
```

## Handoff Pack

Deployment and security handoff artifacts are available in:

- [handoff/README.md](file:///c:/Users/Praveen/Documents/FuelFlow/handoff/README.md)
- [01_rls_baseline.sql](file:///c:/Users/Praveen/Documents/FuelFlow/handoff/supabase/01_rls_baseline.sql)
- [02_optional_app_role_policies.sql](file:///c:/Users/Praveen/Documents/FuelFlow/handoff/supabase/02_optional_app_role_policies.sql)
- [release-checklist.md](file:///c:/Users/Praveen/Documents/FuelFlow/handoff/release-checklist.md)
- `.env.preview.example`
- `.env.production.example`

## Testing

Current repository-level automated coverage is focused and lightweight:

- calibration validation
- finance alias resolution
- sales backend normalization
- stock and tanker validation
- loss/gain reconciliation math

Run:

```bash
npm test
```

## Known Operational Notes

- The project currently favors safe incremental hardening over a full backend rewrite.
- Some in-app documentation pages contain roadmap/reference material in addition to implemented behavior.
- The JS bundle is currently large enough to trigger Vite chunk-size warnings during production build.

## Recommended Next Improvements

- Add API integration tests around specialized handlers
- Document Supabase schema migrations and seed data
- Tighten production auth/RLS documentation
- Add route-based code splitting for large screens
