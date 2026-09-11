// StatKick Supabase browser client.
// The UMD build is loaded by index.html/admin.html before this module so
// the application does not depend on an ESM CDN dependency chain.
const sb = window.supabase;
if (!sb || typeof sb.createClient !== 'function') {
  throw new Error('Supabase browser library failed to load.');
}

export const SUPABASE_URL = 'https://iixnmsdysfjtzdfcqczx.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzaxZdqd0DHhXe4wRPs3nQ_yZvuqgz4';
export const supabase = sb.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
