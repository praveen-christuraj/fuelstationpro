import { createClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from './runtime-config.js';

const supabase = createClient(
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY')
);

export default supabase;
