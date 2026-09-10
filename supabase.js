import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://iixnmsdysfjtzdfcqczx.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzaxZdqd0DHhXe4wRPs3nQ_yZvuqgz4';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
