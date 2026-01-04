import { createClient } from '@supabase/supabase-js'

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
