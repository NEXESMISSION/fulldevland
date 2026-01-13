// Shared authentication utilities for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function verifyAuth(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing authorization header')
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseClient.auth.getUser(token)
  
  if (error || !user) {
    throw new Error('Unauthorized')
  }

  // Get user profile
  const { data: userProfile } = await supabaseClient
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (!userProfile || (userProfile.status !== 'Active' && userProfile.role !== 'Owner')) {
    throw new Error('User not active')
  }

  return { user, userProfile, supabaseClient }
}

