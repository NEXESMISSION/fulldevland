# Login Rate Limiting & CAPTCHA Implementation

## Overview

This document describes the comprehensive rate limiting and CAPTCHA protection system implemented to prevent brute force attacks on the login system.

## Problem

Previously, the login system had:
- Limited rate limiting (only localStorage-based)
- No CAPTCHA protection
- Weak account lockout enforcement
- No IP-based tracking
- No database logging

This made the system vulnerable to brute force attacks.

## Solution

A multi-layer protection system has been implemented:

1. **Database-Backed Rate Limiting** - Server-side validation
2. **Account Lockout** - Automatic after 5 failed attempts
3. **CAPTCHA Protection** - Required after 3 failed attempts
4. **IP Tracking** - All attempts logged with IP address
5. **Audit Logging** - Complete login attempt history

## Implementation

### 1. Database Functions

**File**: `add_login_attempts_tracking.sql`

#### `should_lock_account(email_address VARCHAR)`
Checks if an account should be locked based on failed attempts.

```sql
SELECT should_lock_account('user@example.com');
-- Returns: true if 5+ failed attempts in last 15 minutes
```

#### `get_failed_attempts(email_address VARCHAR)`
Returns the count of failed attempts in the last 15 minutes.

```sql
SELECT get_failed_attempts('user@example.com');
-- Returns: number of failed attempts (0-5+)
```

#### `login_attempts` Table
Stores all login attempts with:
- Email address
- IP address
- Success/failure status
- Timestamp
- User agent

### 2. Frontend Components

#### CAPTCHA Component
**File**: `frontend/src/components/ui/captcha.tsx`

- Simple math-based CAPTCHA (no external dependencies)
- Auto-generates new challenge on refresh
- Validates answer in real-time
- Visual feedback for success/error

**Usage**:
```tsx
<Captcha 
  onVerify={(isValid) => setCaptchaVerified(isValid)}
  required={true}
/>
```

#### Enhanced AuthContext
**File**: `frontend/src/contexts/AuthContext.tsx`

**New Functions**:
- `getFailedAttemptsFromDB()` - Gets failed attempts from database
- `shouldLockAccount()` - Checks if account is locked
- `recordFailedAttempt()` - Logs failed attempt (database + localStorage)
- `clearFailedAttempts()` - Clears attempts on successful login
- `getClientIP()` - Gets client IP address
- `getFailedAttemptsCount()` - Public method to get attempt count

**Enhanced `signIn()` Function**:
```typescript
const result = await signIn(email, password, captchaVerified)
// Returns: { error, requiresCaptcha, failedAttempts }
```

### 3. Login Page Integration

**File**: `frontend/src/pages/Login.tsx`

**Features**:
- Automatically checks if CAPTCHA is required based on failed attempts
- Shows CAPTCHA when 3+ failed attempts
- Displays failed attempts count
- Shows lockout warning when account is locked
- Validates CAPTCHA before allowing login

## How It Works

### Login Flow

1. **User enters email and password**
   - System checks failed attempts from database
   - If 3+ attempts → CAPTCHA shown
   - If 5+ attempts → Account locked message shown

2. **CAPTCHA Verification** (if required)
   - User solves math CAPTCHA
   - CAPTCHA verified before login attempt

3. **Login Attempt**
   - System checks if account is locked
   - If locked → Error message, no login attempt
   - If not locked → Proceeds with login

4. **Result Handling**
   - **Success**: Clears failed attempts, logs success
   - **Failure**: Records failed attempt, updates count, may require CAPTCHA

### Rate Limiting Rules

- **0-2 failed attempts**: Normal login, no CAPTCHA
- **3-4 failed attempts**: CAPTCHA required
- **5+ failed attempts**: Account locked for 15 minutes
- **After 15 minutes**: Lockout expires, attempts reset

### Security Layers

1. **Client-Side** (localStorage) - Fast feedback, can be bypassed
2. **Server-Side** (Database) - Authoritative, cannot be bypassed
3. **CAPTCHA** - Prevents automated attacks
4. **Account Lockout** - Prevents brute force

## Configuration

### Lockout Settings

**Current Configuration**:
- Lockout threshold: **5 failed attempts**
- Lockout window: **15 minutes**
- CAPTCHA threshold: **3 failed attempts**

**To Change** (in `add_login_attempts_tracking.sql`):
```sql
lockout_threshold INTEGER := 5;  -- Change this
lockout_window INTERVAL := '15 minutes';  -- Change this
```

### CAPTCHA Settings

**Current**: Math-based CAPTCHA (simple addition)

**For Production**: Consider using:
- Google reCAPTCHA v3 (invisible)
- hCaptcha (privacy-focused)
- Cloudflare Turnstile

## Testing

### Test Scenarios

1. **Normal Login** (0 failed attempts):
   - ✅ Should work without CAPTCHA
   - ✅ Should log successful attempt

2. **After 3 Failed Attempts**:
   - ✅ Should require CAPTCHA
   - ✅ Should show failed attempts count
   - ✅ Should block login without CAPTCHA

3. **After 5 Failed Attempts**:
   - ✅ Should show lockout message
   - ✅ Should block all login attempts
   - ✅ Should allow login after 15 minutes

4. **CAPTCHA Verification**:
   - ✅ Should validate correct answer
   - ✅ Should reject incorrect answer
   - ✅ Should allow refresh/new challenge

### Manual Testing

```sql
-- Check failed attempts for an email
SELECT get_failed_attempts('user@example.com');

-- Check if account is locked
SELECT should_lock_account('user@example.com');

-- View all login attempts
SELECT * FROM login_attempts 
WHERE email = 'user@example.com' 
ORDER BY attempted_at DESC;
```

## Monitoring

### Database Queries

**Failed Login Attempts**:
```sql
SELECT email, COUNT(*) as failed_count
FROM login_attempts
WHERE success = FALSE
AND attempted_at > NOW() - INTERVAL '1 hour'
GROUP BY email
ORDER BY failed_count DESC;
```

**Suspicious IPs**:
```sql
SELECT ip_address, COUNT(*) as attempt_count
FROM login_attempts
WHERE success = FALSE
AND attempted_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) > 10
ORDER BY attempt_count DESC;
```

**Locked Accounts**:
```sql
SELECT email, COUNT(*) as failed_attempts
FROM login_attempts
WHERE success = FALSE
AND attempted_at > NOW() - INTERVAL '15 minutes'
GROUP BY email
HAVING COUNT(*) >= 5;
```

## Best Practices

1. **Monitor Regularly**: Check `login_attempts` table weekly
2. **Review Patterns**: Look for suspicious IP addresses
3. **Adjust Thresholds**: If too many false positives, increase threshold
4. **User Education**: Inform users about lockout policy
5. **Backup Access**: Ensure Owners can unlock accounts if needed

## Troubleshooting

### Issue: CAPTCHA not showing
- Check if `get_failed_attempts()` function exists
- Verify `login_attempts` table exists
- Check browser console for errors

### Issue: Account locked but should be unlocked
- Check database: `SELECT get_failed_attempts('email@example.com')`
- Verify 15 minutes have passed since last attempt
- Check `login_attempts` table for recent entries

### Issue: Failed attempts not counting
- Verify `login_attempts` table has INSERT permission
- Check RLS policies on `login_attempts` table
- Verify database functions are working

## Future Enhancements

- [ ] Email notifications for suspicious activity
- [ ] Admin dashboard for viewing login attempts
- [ ] IP whitelist/blacklist functionality
- [ ] Two-factor authentication (2FA)
- [ ] Password reset with rate limiting
- [ ] Account recovery process

## Files Modified

1. `add_login_attempts_tracking.sql` - Database functions and table
2. `frontend/src/contexts/AuthContext.tsx` - Enhanced signIn function
3. `frontend/src/components/ui/captcha.tsx` - CAPTCHA component (new)
4. `frontend/src/pages/Login.tsx` - CAPTCHA integration

## Conclusion

The login system now has comprehensive protection against brute force attacks:
- ✅ Database-backed rate limiting
- ✅ Account lockout enforcement
- ✅ CAPTCHA protection
- ✅ IP tracking and audit logging
- ✅ User-friendly error messages

**Status**: ✅ **IMPLEMENTED AND READY TO USE**

