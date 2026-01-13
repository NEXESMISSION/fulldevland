# Performance Optimization Implementation Guide

This document outlines the comprehensive performance optimizations implemented to prevent performance collapse and cost spikes as usage grows.

## Overview

The optimizations include:
1. ✅ Edge Functions for request aggregation and validation
2. ✅ Database indexes based on query patterns
3. ✅ RLS policy optimizations
4. ✅ Caching layer for hot data
5. ✅ Query latency monitoring
6. ✅ Migration contingency plan

---

## Installation Steps

### Step 1: Fix SQL Errors (Run First!)

**IMPORTANT**: Before running the optimization scripts, fix the SQL errors by running:

```sql
-- Run this file first to fix any SQL errors
\i PERFORMANCE_OPTIMIZATION_FIXES.sql
```

This will:
- Fix index predicate issues (OR clauses)
- Fix materialized view enum casting
- Fix cache freshness function

### Step 2: Create Database Indexes

```sql
-- Run in Supabase SQL Editor
\i performance_optimization_indexes.sql
```

This creates:
- Indexes for RLS policy queries
- Indexes for sales, clients, land pieces, installments, payments
- Helper functions for aggregation

### Step 3: Optimize RLS Policies

```sql
-- Run in Supabase SQL Editor
\i performance_optimization_rls.sql
```

This:
- Optimizes `get_user_role()` function (marks as STABLE)
- Creates materialized view for active users
- Creates helper functions for permission checks

### Step 4: Implement Caching

```sql
-- Run in Supabase SQL Editor
\i performance_caching_implementation.sql
```

This creates:
- Materialized views for dashboard stats
- Client summary cache
- Cache refresh functions
- Cache monitoring functions

### Step 5: Setup Monitoring

```sql
-- Run in Supabase SQL Editor
\i performance_monitoring.sql
```

This creates:
- Query performance logging table
- Functions to log slow queries
- Performance statistics functions
- Monitoring dashboard view

---

## Edge Functions Setup

### Deploy Edge Functions

1. **Install Supabase CLI** (if not already installed):
```bash
npm install -g supabase
```

2. **Login to Supabase**:
```bash
supabase login
```

3. **Link your project**:
```bash
supabase link --project-ref your-project-ref
```

4. **Deploy Edge Functions**:
```bash
# Deploy dashboard aggregation function
supabase functions deploy dashboard-aggregate

# Deploy clients batch function
supabase functions deploy clients-batch
```

### Configure Environment Variables

Set these in your Supabase project dashboard under Edge Functions → Settings:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (keep secret!)

---

## Frontend Integration

### Update Dashboard to Use Edge Function

Update `frontend/src/pages/Dashboard.tsx`:

```typescript
// Replace the fetchDashboardData function with:
const fetchDashboardData = async () => {
  setLoading(true)
  setError(null)
  
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(
      `${supabaseUrl}/functions/v1/dashboard-aggregate`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) throw new Error('Failed to fetch dashboard data')

    const result = await response.json()
    
    setLandStats({
      Available: result.landStats.Available || 0,
      Reserved: result.landStats.Reserved || 0,
      Sold: result.landStats.Sold || 0,
      Cancelled: result.landStats.Cancelled || 0,
    })
    setActiveClients(result.activeClients || 0)
    setMonthlyRevenue(result.monthlyRevenue || 0)
    setOverdueInstallments(result.overdueInstallments || [])
  } catch (err) {
    console.error('Dashboard fetch error:', err)
    setError('Failed to load dashboard data')
  } finally {
    setLoading(false)
  }
}
```

### Update Clients Page to Use Edge Function

Update `frontend/src/pages/Clients.tsx`:

```typescript
// Replace fetchClients with:
const fetchClients = async () => {
  try {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    const response = await fetch(
      `${supabaseUrl}/functions/v1/clients-batch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          includeSales: true,
          includeReservations: true,
        }),
      }
    )

    if (!response.ok) throw new Error('Failed to fetch clients')

    const result = await response.json()
    setClients(result.data || [])
  } catch (error) {
    console.error('Error fetching clients:', error)
    setErrorMessage('خطأ في تحميل قائمة العملاء')
  } finally {
    setLoading(false)
  }
}
```

---

## Cache Management

### Manual Cache Refresh

```sql
-- Refresh dashboard cache
SELECT refresh_dashboard_stats_cache();

-- Refresh clients cache
SELECT refresh_clients_summary_cache();

-- Refresh active users cache
SELECT refresh_active_users_cache();
```

### Automatic Cache Refresh (Recommended)

Set up pg_cron jobs (requires pg_cron extension):

```sql
-- Refresh dashboard cache every 5 minutes
SELECT cron.schedule(
  'refresh-dashboard-cache',
  '*/5 * * * *',
  'SELECT refresh_dashboard_stats_cache();'
);

-- Refresh clients cache every 10 minutes
SELECT cron.schedule(
  'refresh-clients-cache',
  '*/10 * * * *',
  'SELECT refresh_clients_summary_cache();'
);

-- Refresh users cache every 5 minutes
SELECT cron.schedule(
  'refresh-users-cache',
  '*/5 * * * *',
  'SELECT refresh_active_users_cache();'
);
```

### Check Cache Freshness

```sql
-- Check all cache freshness
SELECT * FROM check_cache_freshness();
```

---

## Monitoring

### View Performance Statistics

```sql
-- Get performance stats for last 24 hours
SELECT * FROM get_query_performance_stats(24, 100);

-- Get slowest queries
SELECT * FROM get_slowest_queries(20, 24);

-- Get table access statistics
SELECT * FROM get_table_access_stats(24);

-- View monitoring dashboard
SELECT * FROM performance_monitoring_dashboard;
```

### Log Slow Queries

The monitoring system automatically logs queries slower than 500ms. To adjust:

```sql
-- Update the threshold in log_slow_query function
-- Currently set to 500ms in performance_monitoring.sql
```

---

## Index Usage Analysis

### Check Index Usage

```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Check Unused Indexes

```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan = 0
AND indexname NOT LIKE 'idx_%_unique'
ORDER BY tablename;
```

---

## Read Replicas Preparation

The optimizations prepare for read replicas by:

1. **Separating read and write queries**: Edge Functions can be configured to use read replicas
2. **Materialized views**: Can be refreshed on replicas independently
3. **Caching layer**: Reduces load on primary database

### When to Enable Read Replicas

Consider read replicas when:
- Read traffic exceeds 80% of total queries
- Query latency increases despite optimizations
- Database CPU usage consistently > 70%

### Configuration

Update Edge Functions to use read replica URL:

```typescript
// In Edge Functions, use read replica for SELECT queries
const readReplicaUrl = Deno.env.get('SUPABASE_READ_REPLICA_URL')
const supabaseRead = createClient(
  readReplicaUrl || supabaseUrl,
  serviceRoleKey
)
```

---

## Migration Contingency Plan

See `MIGRATION_CONTINGENCY_PLAN.md` for:
- Pre-migration checklist
- Authentication migration steps
- Data export/import procedures
- Verification steps
- Rollback procedures

---

## Performance Benchmarks

### Expected Improvements

- **Dashboard Load Time**: 60-80% reduction (from ~2s to ~0.4s)
- **Client List Load Time**: 50-70% reduction (from ~1.5s to ~0.5s)
- **Database Query Count**: 70-90% reduction (batching)
- **API Costs**: 60-80% reduction (fewer REST calls)

### Monitoring Metrics

Track these metrics:
- Average query latency (target: < 100ms)
- Cache hit rate (target: > 80%)
- Edge Function latency (target: < 200ms)
- Database CPU usage (target: < 60%)

---

## Troubleshooting

### Cache Not Refreshing

```sql
-- Check if materialized views exist
SELECT * FROM pg_matviews WHERE schemaname = 'public';

-- Manually refresh
SELECT refresh_dashboard_stats_cache();
```

### Edge Functions Not Working

1. Check environment variables are set
2. Verify authentication token is valid
3. Check Edge Function logs in Supabase dashboard
4. Verify CORS headers are correct

### Slow Queries Still Occurring

1. Check index usage: `SELECT * FROM pg_stat_user_indexes`
2. Analyze query plans: `EXPLAIN ANALYZE [query]`
3. Check for missing indexes
4. Review RLS policy performance

---

## Maintenance

### Weekly Tasks

- Review slow query logs
- Check cache hit rates
- Analyze index usage
- Review performance statistics

### Monthly Tasks

- Clean up old performance logs (kept for 30 days)
- Review and optimize unused indexes
- Update cache TTLs based on usage patterns
- Review Edge Function performance

---

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review SQL error logs in Supabase dashboard
3. Check Edge Function logs
4. Review performance monitoring data

---

## Next Steps

1. ✅ Run `PERFORMANCE_OPTIMIZATION_FIXES.sql` first
2. ✅ Apply all SQL optimization files
3. ✅ Deploy Edge Functions
4. ✅ Update frontend to use Edge Functions
5. ✅ Set up automatic cache refresh
6. ✅ Monitor performance metrics
7. ✅ Adjust based on actual usage patterns

