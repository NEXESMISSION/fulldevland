# Supabase API Monitoring & Rate Limiting Guide

## Overview

This guide explains how to monitor API usage and configure rate limiting in Supabase to protect against abuse and detect suspicious activity.

## Why Monitor API Usage?

Even though the anon key is public (which is expected and secure), monitoring API usage helps:
- Detect suspicious activity or attacks
- Identify performance issues
- Track usage patterns
- Prevent abuse and DoS attacks
- Comply with security best practices

## Setting Up API Monitoring

### 1. Access Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings** → **API**

### 2. View API Usage Statistics

**Location**: Dashboard → **Settings** → **API** → **Usage**

You can see:
- Total API requests
- Requests per endpoint
- Requests over time
- Error rates
- Response times

### 3. Monitor Real-Time Activity

**Location**: Dashboard → **Logs** → **API Logs**

View:
- Real-time API requests
- Request details (endpoint, method, status)
- Response times
- Error messages
- User information (if authenticated)

### 4. Set Up Alerts

**Location**: Dashboard → **Settings** → **Alerts**

Configure alerts for:
- High error rates (> 5% errors)
- Unusual traffic spikes
- Failed authentication attempts
- Suspicious patterns

## Configuring Rate Limiting

### 1. Enable Rate Limiting

**Location**: Dashboard → **Settings** → **API** → **Rate Limiting**

**Recommended Settings**:

#### For Anonymous Users (Anon Key)
- **Requests per minute**: 60-100 requests
- **Burst limit**: 10-20 requests
- **Window**: 1 minute

#### For Authenticated Users
- **Requests per minute**: 200-500 requests
- **Burst limit**: 50-100 requests
- **Window**: 1 minute

#### For Specific Endpoints
You can set custom limits for:
- `/auth/*` endpoints: 10 requests/minute (prevent brute force)
- `/rest/v1/*` endpoints: Based on your needs
- `/storage/*` endpoints: Based on file size and frequency

### 2. Configure IP-Based Rate Limiting

**Location**: Dashboard → **Settings** → **API** → **Rate Limiting** → **IP Limits**

Set limits per IP address:
- **Anonymous IPs**: 30 requests/minute
- **Known IPs**: Higher limits (if needed)

### 3. Set Up Rate Limit Headers

Supabase automatically adds rate limit headers to responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640995200
```

Monitor these in your application to handle rate limit errors gracefully.

## Monitoring Best Practices

### 1. Regular Review Schedule

- **Daily**: Check error rates and unusual spikes
- **Weekly**: Review API usage patterns
- **Monthly**: Analyze trends and optimize

### 2. Key Metrics to Monitor

#### Security Metrics
- Failed authentication attempts
- Unauthorized access attempts
- Unusual request patterns
- Requests from suspicious IPs

#### Performance Metrics
- Response times (p50, p95, p99)
- Error rates
- Request volume
- Database query performance

#### Usage Metrics
- Total requests per day/week/month
- Requests per user
- Most used endpoints
- Peak usage times

### 3. Set Up Automated Monitoring

#### Using Supabase Dashboard
1. Go to **Settings** → **Alerts**
2. Configure email/Slack notifications for:
   - High error rates
   - Unusual traffic
   - Failed authentication spikes

#### Using External Monitoring (Optional)
- **Datadog**: Supabase integration available
- **New Relic**: Monitor API performance
- **Sentry**: Error tracking and alerting
- **Custom scripts**: Query Supabase logs API

## Detecting Suspicious Activity

### Red Flags to Watch For

1. **Brute Force Attacks**
   - Multiple failed login attempts from same IP
   - Rapid authentication attempts
   - **Action**: Enable stricter rate limiting on `/auth/*` endpoints

2. **Data Scraping**
   - High volume of read requests
   - Requests from unknown IPs
   - Unusual query patterns
   - **Action**: Review RLS policies, add IP whitelisting if needed

3. **DoS Attempts**
   - Extremely high request volume
   - Requests to expensive endpoints
   - **Action**: Enable rate limiting, block suspicious IPs

4. **Unauthorized Access Attempts**
   - Failed RLS policy checks
   - Access attempts to restricted data
   - **Action**: Review audit logs, check RLS policies

### How to Investigate

1. **Check API Logs**
   - Filter by IP address
   - Filter by endpoint
   - Filter by error type
   - Look for patterns

2. **Review Audit Logs**
   - Check `audit_logs` table
   - Look for suspicious user activity
   - Review permission changes

3. **Analyze Request Patterns**
   - Compare to normal usage
   - Check for unusual times
   - Look for automated patterns

## Rate Limiting Implementation

### Frontend Handling

Add rate limit error handling in your application:

```typescript
// Example: Handle rate limit errors
try {
  const { data, error } = await supabase.from('clients').select('*')
  
  if (error) {
    if (error.code === 'PGRST116' || error.message.includes('rate limit')) {
      // Rate limit exceeded
      showNotification('Too many requests. Please wait a moment.', 'warning')
      // Retry after delay
      setTimeout(() => retryOperation(), 60000)
    } else {
      // Other error
      handleError(error)
    }
  }
} catch (error) {
  handleError(error)
}
```

### Backend Handling (If Using Edge Functions)

```typescript
// Example: Check rate limits in Edge Functions
const checkRateLimit = async (userId: string) => {
  // Implement your rate limiting logic
  // Use Supabase storage or Redis for tracking
}
```

## Recommended Rate Limits

### Development Environment
- **Anon key**: 1000 requests/minute (generous for testing)
- **Auth endpoints**: 100 requests/minute

### Production Environment
- **Anon key**: 60-100 requests/minute
- **Authenticated users**: 200-500 requests/minute
- **Auth endpoints**: 10-20 requests/minute (prevent brute force)

### High-Traffic Applications
- Adjust based on your needs
- Monitor and optimize
- Consider caching to reduce API calls

## Monitoring Checklist

- [ ] Rate limiting enabled in Supabase dashboard
- [ ] Alerts configured for high error rates
- [ ] Alerts configured for unusual traffic
- [ ] API usage dashboard reviewed weekly
- [ ] Rate limit errors handled in frontend
- [ ] Suspicious activity investigation process defined
- [ ] IP blocking procedure documented
- [ ] Monitoring schedule established

## Additional Resources

- [Supabase Rate Limiting Docs](https://supabase.com/docs/guides/platform/rate-limits)
- [Supabase API Logs](https://supabase.com/docs/guides/platform/logs)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)

## Notes

- Rate limiting is applied at the project level
- Different rate limits can be set for different endpoints
- Rate limit headers are automatically included in responses
- Exceeding rate limits returns HTTP 429 (Too Many Requests)
- Rate limits reset based on the configured window

