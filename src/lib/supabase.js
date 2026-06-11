import { createClient } from '@supabase/supabase-js';
import { getRequiredClientEnv } from './client-env';

const supabase = createClient(
  getRequiredClientEnv('VITE_SUPABASE_URL'),
  getRequiredClientEnv('VITE_SUPABASE_ANON_KEY')
);

export default supabase;
