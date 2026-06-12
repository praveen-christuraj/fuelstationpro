[OPEN] Debug Session: login-failed-to-fetch

## Symptom
- Login fails with "Failed to fetch".

## Expected
- User can sign in (email/password or Google) and is redirected to dashboard.

## Hypotheses (falsifiable)
1. H1: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` is missing or malformed in the client build, causing Supabase auth requests to fail at network layer.
2. H2: Browser blocks the Supabase auth request due to CORS / mixed-content / invalid SSL, producing `TypeError: Failed to fetch`.
3. H3: The app is running on an origin not included in Supabase project's allowed redirect / auth settings, causing auth call to be blocked or fail.
4. H4: The frontend `fetch` is being routed through a wrong proxy/base URL (e.g., Vite proxy misconfig), so requests never reach Supabase.
5. H5: Local network/DNS issue prevents reaching `*.supabase.co`.

## Evidence Plan
- Start debug server and instrument the login path to report:
  - effective `VITE_SUPABASE_URL` (redacted to origin),
  - auth method used,
  - error name/message/stack,
  - whether `fetch` is failing before receiving any HTTP response.

## Status
- Next: Start debug server → add instrumentation → reproduce login → analyze logs → apply minimal fix.

