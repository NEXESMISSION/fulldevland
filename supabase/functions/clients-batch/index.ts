// Edge Function: Clients Data with Batching
// Fetches clients with related data in optimized batches
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body for optional filters
    const body = await req.json().catch(() => ({}))
    const { clientIds, includeSales = true, includeReservations = true } = body

    // Build optimized query with server-side joins
    let query = supabaseClient
      .from('clients')
      .select(`
        *,
        ${includeSales ? 'sales!inner(id, status, sale_date, total_selling_price, payment_type)' : ''},
        ${includeReservations ? 'reservations!inner(id, status, reservation_date, small_advance_amount)' : ''}
      `)
      .order('name', { ascending: true })

    // Apply filters if provided
    if (clientIds && Array.isArray(clientIds) && clientIds.length > 0) {
      query = query.in('id', clientIds)
    }

    // Filter out cancelled sales at database level
    if (includeSales) {
      query = query.neq('sales.status', 'Cancelled')
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    // Filter cancelled sales in response (additional safety)
    const processedData = (data || []).map((client: any) => {
      if (client.sales) {
        client.sales = client.sales.filter((sale: any) => sale.status !== 'Cancelled')
      }
      return client
    })

    return new Response(
      JSON.stringify({ data: processedData, count: processedData.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Clients batch error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

