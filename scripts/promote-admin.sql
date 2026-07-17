-- ══════════════════════════════════════════════════════════
-- Promote a user to admin role
-- How to use:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Paste this file
--   3. Replace 'your-email@example.com' with YOUR email
--   4. Click RUN
-- ══════════════════════════════════════════════════════════

-- Replace the email below with YOUR email address:
UPDATE auth.users
SET raw_user_meta_data = 
  COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'your-email@example.com';

-- Verify it worked:
SELECT id, email, raw_user_meta_data->>'role' AS role
FROM auth.users
WHERE email = 'your-email@example.com';
