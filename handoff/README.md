# FuelFlow Handoff Pack

This directory contains deployment and production-hardening handoff artifacts for FuelFlow.

## Contents

- `supabase/01_rls_baseline.sql`
  - Recommended baseline for the current architecture
  - Enables RLS on business tables
  - Revokes direct browser-role access from `anon` and `authenticated`
  - Keeps business data flowing through the serverless API using the service-role key

- `supabase/02_optional_app_role_policies.sql`
  - Optional future-facing policy examples
  - Use only if you intentionally move some business-table reads to direct client access
  - Assumes you add an `app_role` claim in Supabase auth JWT metadata

- `release-checklist.md`
  - FuelFlow-specific release checklist for preview and production

## Environment Templates

The repository root includes:

- `.env.preview.example`
- `.env.production.example`

Copy the appropriate template into your deployment environment and replace placeholder values before release.

## Current Architecture Assumption

The current FuelFlow web app does not use direct browser reads/writes for business tables. The browser uses Supabase for auth, while business data flows through `/api/*` serverless routes backed by the service-role key.

Because of that, the recommended production baseline is:

- enable RLS on all business tables
- revoke browser-role access to those tables
- keep privileged mutations behind the serverless API

If you later introduce direct client access for selected tables, use the optional policy examples as a starting point rather than weakening the baseline globally.
