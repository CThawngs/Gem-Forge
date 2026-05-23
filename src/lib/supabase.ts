import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. Supabase will not work.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
