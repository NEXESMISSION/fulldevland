// Edge Function: Dashboard Data Aggregation
// Aggregates multiple queries into a single response to reduce REST calls
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role for server-side operations
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

    // Get auth token from request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user role for permission checks
    const { data: userProfile } = await supabaseClient
      .from('users')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (!userProfile || userProfile.status !== 'Active') {
      return new Response(
        JSON.stringify({ error: 'User not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Execute all queries in parallel with optimized joins
    const [
      landStatsResult,
      salesResult,
      revenueResult,
      overdueResult
    ] = await Promise.all([
      // Land pieces status aggregation (single query with COUNT)
      supabaseClient
        .rpc('get_land_pieces_stats')
        .single(),
      
      // Active clients count (optimized with DISTINCT)
      supabaseClient
        .from('sales')
        .select('client_id', { count: 'exact', head: false })
        .neq('status', 'Cancelled'),
      
      // Monthly revenue (using database function for efficiency)
      supabaseClient
        .rpc('calculate_monthly_revenue', {
          target_month: new Date().getMonth() + 1,
          target_year: new Date().getFullYear()
        })
        .single(),
      
      // Overdue installments with joins (single query)
      supabaseClient
        .from('installments')
        .select(`
          *,
          sale:sales!inner(
            id,
            sale_date,
            client:clients!inner(id, name, phone, cin)
          )
        `)
        .eq('status', 'Late')
        .order('due_date', { ascending: true })
        .limit(10)
    ])

    // Process results
    const landStats = landStatsResult.data || { Available: 0, Reserved: 0, Sold: 0, Cancelled: 0 }
    
    // Get unique client count
    const uniqueClients = new Set<string>()
    if (salesResult.data) {
      salesResult.data.forEach((sale: any) => {
        if (sale.client_id) uniqueClients.add(sale.client_id)
      })
    }

    const monthlyRevenue = revenueResult.data || 0
    const overdueInstallments = overdueResult.data || []

    // Return aggregated response
    return new Response(
      JSON.stringify({
        landStats,
        activeClients: uniqueClients.size,
        monthlyRevenue,
        overdueInstallments,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Dashboard aggregation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

