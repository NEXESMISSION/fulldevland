# Session Timeout & Re-Authentication Implementation

## Overview

This document describes the enhanced session management system with improved security timeouts and re-authentication requirements.

## Changes Made

### 1. Reduced Session Timeout
- **Before**: 24 hours
- **After**: 8 hours
- **Reason**: Reduces risk if session token is stolen

### 2. Reduced Inactivity Timeout
- **Before**: 30 minutes
- **After**: 15 minutes
- **Reason**: Better security for unattended sessions

### 3. Token Refresh Mechanism
- **Interval**: 7 hours (refreshes before 8h expiry)
- **Automatic**: Runs in background
- **Fallback**: Signs out if refresh fails

### 4. Re-Authentication for Sensitive Operations
- **Timeout**: 1 hour
- **Purpose**: Force re-authentication for critical operations
- **Operations**: Delete, payment, financial changes, etc.

## Implementation

### Session Timeout Configuration

```typescript
// Session timeout: 8 hours (reduced from 24 hours)
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000

// Inactivity timeout: 15 minutes (reduced from 30 minutes)
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

// Token refresh interval: Refresh token 5 minutes before expiry
const TOKEN_REFRESH_INTERVAL_MS = 7 * 60 * 60 * 1000 // 7 hours

// Re-authentication required timeout: 1 hour
const REAUTH_REQUIRED_TIMEOUT_MS = 60 * 60 * 1000
```

### Token Refresh

The system automatically refreshes tokens before expiry:

```typescript
const refreshToken = async () => {
  const { data, error } = await supabase.auth.refreshSession()
  if (error) {
    // If refresh fails, sign out
    signOut()
  } else if (data?.session) {
    setSession(data.session)
    setUser(data.session.user)
    lastAuthTimeRef.current = Date.now()
  }
}
```

### Re-Authentication Check

Before performing sensitive operations, check if re-authentication is required:

```typescript
const requiresReAuth = (): boolean => {
  if (!user) return true
  const timeSinceLastAuth = Date.now() - lastAuthTimeRef.current
  return timeSinceLastAuth > REAUTH_REQUIRED_TIMEOUT_MS
}
```

## Usage in Components

### Example: Delete Operation

```typescript
import { useAuth } from '@/contexts/AuthContext'

function DeleteButton() {
  const { requiresReAuth, updateLastAuthTime } = useAuth()
  
  const handleDelete = async () => {
    // Check if re-authentication is required
    if (requiresReAuth()) {
      // Show re-authentication dialog
      const password = await promptForPassword()
      if (!password) return
      
      // Verify password
      const { error } = await signIn(email, password)
      if (error) {
        showError('كلمة المرور غير صحيحة')
        return
      }
    }
    
    // Perform delete operation
    await deleteItem()
    
    // Update last auth time after successful operation
    updateLastAuthTime()
  }
}
```

### Example: Payment Operation

```typescript
function PaymentForm() {
  const { requiresReAuth, updateLastAuthTime } = useAuth()
  
  const handlePayment = async () => {
    if (requiresReAuth()) {
      // Force re-authentication
      navigate('/re-auth?redirect=/payment')
      return
    }
    
    // Process payment
    await processPayment()
    updateLastAuthTime()
  }
}
```

## Security Benefits

1. **Shorter Session Timeout**: Reduces exposure if token is stolen
2. **Shorter Inactivity Timeout**: Prevents unauthorized access to unattended sessions
3. **Automatic Token Refresh**: Maintains session without user intervention
4. **Re-Authentication**: Adds extra security layer for sensitive operations

## Configuration

### Adjusting Timeouts

Edit `frontend/src/contexts/AuthContext.tsx`:

```typescript
// For stricter security (shorter timeouts)
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000  // 4 hours
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000   // 10 minutes
const REAUTH_REQUIRED_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes

// For better UX (longer timeouts)
const SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000  // 12 hours
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000    // 20 minutes
const REAUTH_REQUIRED_TIMEOUT_MS = 2 * 60 * 60 * 1000  // 2 hours
```

## Testing

### Test Scenarios

1. **Session Timeout**:
   - Login and wait 8 hours
   - Should be automatically logged out

2. **Inactivity Timeout**:
   - Login and leave browser idle for 15 minutes
   - Should be automatically logged out

3. **Token Refresh**:
   - Login and wait 7 hours
   - Token should refresh automatically
   - Session should remain active

4. **Re-Authentication**:
   - Login and wait 1 hour
   - Try to perform sensitive operation
   - Should require re-authentication

## Best Practices

1. **Use Re-Authentication for**:
   - Delete operations
   - Payment processing
   - Financial changes
   - User management
   - System settings

2. **Update Last Auth Time**:
   - After successful sensitive operations
   - After re-authentication
   - After password verification

3. **User Experience**:
   - Show clear messages when re-authentication is required
   - Provide easy way to re-authenticate
   - Don't lose user's work when session expires

## Future Enhancements

- [ ] Re-authentication dialog component
- [ ] Remember sensitive operation state during re-auth
- [ ] Configurable timeout per operation type
- [ ] Session activity indicators
- [ ] Warning before session expires

## Files Modified

1. `frontend/src/contexts/AuthContext.tsx` - Enhanced session management
2. `add_login_attempts_tracking.sql` - Fixed Manager enum reference

## Conclusion

The session management system now provides:
- ✅ Shorter session timeouts (8 hours)
- ✅ Shorter inactivity timeouts (15 minutes)
- ✅ Automatic token refresh
- ✅ Re-authentication for sensitive operations
- ✅ Better security overall

**Status**: ✅ **IMPLEMENTED**

