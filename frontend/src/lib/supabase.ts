import { createClient } from '@supabase/supabase-js'

/**
 * SECURITY NOTE: Supabase Anon Key Exposure
 * 
 * The anon key is intentionally public and visible in the browser. This is EXPECTED behavior
 * and is secure by design. Here's why:
 * 
 * 1. Anon key has LIMITED permissions - It can only access what Row Level Security (RLS)
 *    policies allow. RLS policies enforce database-level security.
 * 
 * 2. Authentication required - Most operations require an authenticated user session.
 *    The anon key alone cannot access protected data.
 * 
 * 3. Service role key is NEVER exposed - The service_role key (which has admin access)
 *    is only used server-side and is NEVER included in frontend code.
 * 
 * 4. Multi-layer protection:
 *    - Client-side permission checks (UI feedback)
 *    - Server-side permission validation (prevents bypass)
 *    - Database RLS policies (final protection)
 * 
 * Security comes from RLS policies, not from hiding the anon key.
 * If you see the anon key in browser DevTools, this is normal and secure.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

// Optimized Supabase client configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage for faster reloads
    persistSession: true,
    // Auto refresh token before expiry
    autoRefreshToken: true,
    // Detect session from URL (for OAuth)
    detectSessionInUrl: true,
    // Storage key for session
    storageKey: 'land-system-auth',
  },
  global: {
    headers: {
      // Prefer minimal response for faster transfers
      'Prefer': 'return=minimal',
    },
  },
  // Enable realtime subscriptions if needed
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
