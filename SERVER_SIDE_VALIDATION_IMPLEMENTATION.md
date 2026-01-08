# Server-Side Permission Validation Implementation

## Overview

This document describes the server-side permission validation system implemented to prevent client-side authorization bypass attacks.

## Problem

Client-side permission checks using `hasPermission()` can be bypassed by:
- Modifying JavaScript in browser DevTools
- Disabling JavaScript checks
- Making direct API calls to Supabase REST API
- Using browser extensions to modify requests

While RLS (Row Level Security) provides database-level protection, adding server-side validation provides an additional security layer and better user experience.

## Solution

A multi-layer security approach has been implemented:

1. **Client-Side Checks** (UI feedback) - `hasPermission()` from `AuthContext`
2. **Server-Side Validation** (prevents bypass) - New validation functions
3. **Database RLS** (final protection) - Existing RLS policies

## Implementation

### 1. Database Functions

**File**: `add_server_side_permission_validation.sql`

Three PostgreSQL functions have been created:

#### `validate_user_permission(permission_name TEXT)`
Validates a single permission server-side.

```sql
SELECT validate_user_permission('edit_clients');
-- Returns: true or false
```

#### `validate_user_permissions(permission_names TEXT[])`
Validates that user has ALL specified permissions.

```sql
SELECT validate_user_permissions(ARRAY['edit_clients', 'delete_clients']);
-- Returns: true only if user has BOTH permissions
```

#### `validate_user_any_permission(permission_names TEXT[])`
Validates that user has AT LEAST ONE of the specified permissions.

```sql
SELECT validate_user_any_permission(ARRAY['edit_sales', 'sale_confirm']);
-- Returns: true if user has EITHER permission
```

**To Apply**:
```bash
# Run this SQL file in your Supabase SQL editor
psql -f add_server_side_permission_validation.sql
# Or copy-paste into Supabase Dashboard → SQL Editor
```

### 2. Frontend Utility Functions

**File**: `frontend/src/lib/permissionValidation.ts`

#### `validatePermissionServerSide(permission: string): Promise<boolean>`
Validates a permission server-side.

```typescript
const hasPermission = await validatePermissionServerSide('edit_clients');
if (!hasPermission) {
  setErrorMessage('Permission denied');
  return;
}
```

#### `validatePermissionsServerSide(permissions: string[]): Promise<boolean>`
Validates multiple permissions (ALL required).

```typescript
const hasPermissions = await validatePermissionsServerSide(['edit_clients', 'delete_clients']);
```

#### `validateAnyPermissionServerSide(permissions: string[]): Promise<boolean>`
Validates multiple permissions (ANY required).

```typescript
const hasAnyPermission = await validateAnyPermissionServerSide(['edit_sales', 'sale_confirm']);
```

#### `requirePermission(permission: string, errorMessage?: string): Promise<void>`
Throws an error if permission is denied.

```typescript
try {
  await requirePermission('edit_clients', 'You cannot edit clients');
  // Proceed with operation
} catch (error) {
  setErrorMessage(error.message);
  return;
}
```

#### `requirePermissions(permissions: string[], errorMessage?: string): Promise<void>`
Throws an error if any permission is denied.

```typescript
try {
  await requirePermissions(['edit_clients', 'delete_clients']);
  // Proceed with operation
} catch (error) {
  setErrorMessage(error.message);
  return;
}
```

### 3. Usage Pattern in Pages

**Before** (Client-side only):
```typescript
const saveClient = async () => {
  // Client-side check only
  if (!hasPermission('edit_clients')) {
    setErrorMessage('Permission denied');
    return;
  }
  
  // Proceed with operation
  await supabase.from('clients').insert([...]);
}
```

**After** (Client-side + Server-side):
```typescript
import { validatePermissionServerSide } from '@/lib/permissionValidation';

const saveClient = async () => {
  // Client-side check (UI feedback)
  if (!hasPermission('edit_clients')) {
    setErrorMessage('Permission denied');
    return;
  }
  
  // Server-side validation (prevents bypass)
  try {
    const hasServerPermission = await validatePermissionServerSide('edit_clients');
    if (!hasServerPermission) {
      setErrorMessage('Permission denied');
      return;
    }
  } catch (error) {
    console.error('Error validating permission:', error);
    setErrorMessage('Error validating permissions');
    return;
  }
  
  // Proceed with operation
  await supabase.from('clients').insert([...]);
}
```

## Updated Pages

The following pages have been updated with server-side validation:

1. ✅ **Clients.tsx** - Edit and delete operations
2. ✅ **SalesNew.tsx** - Edit, cancel, and payment confirmation operations
3. ✅ **LandManagement.tsx** - Edit and delete operations

## Remaining Pages to Update

Apply the same pattern to these pages:

- `SaleManagement.tsx`
- `Users.tsx`
- `Installments.tsx`
- `FinancialNew.tsx`
- `Expenses.tsx`
- `Workers.tsx`
- `UserPermissions.tsx`
- `Security.tsx`
- `SaleConfirmation.tsx`

## Best Practices

1. **Always use both checks**: Client-side for UX, server-side for security
2. **Validate before operations**: Call server-side validation before any critical operation
3. **Handle errors gracefully**: Server-side validation can fail (network, etc.) - handle errors appropriately
4. **Use appropriate function**: 
   - Single permission → `validatePermissionServerSide()`
   - Multiple permissions (ALL) → `validatePermissionsServerSide()`
   - Multiple permissions (ANY) → `validateAnyPermissionServerSide()`
5. **Keep RLS policies**: Server-side validation is an additional layer, not a replacement for RLS

## Testing

After implementing server-side validation:

1. **Test with valid permissions**: Operations should work normally
2. **Test with invalid permissions**: Operations should be blocked even if client-side check is bypassed
3. **Test network errors**: Ensure graceful handling when server-side validation fails
4. **Test RLS still works**: Verify database-level protection is still active

## Security Benefits

1. **Prevents client-side bypass**: Even if JavaScript is modified, server-side validation blocks unauthorized operations
2. **Better user experience**: Immediate feedback from client-side checks, secure validation from server-side
3. **Defense in depth**: Multiple layers of security (client-side, server-side, database RLS)
4. **Audit trail**: Server-side validation calls can be logged for security monitoring

## Notes

- Server-side validation functions use `SECURITY DEFINER` to ensure they run with proper permissions
- Functions check user status (must be 'Active') in addition to role and permissions
- Functions support both new format (`land_view`) and legacy format (`view_land`) permissions
- Custom user permissions are checked before role permissions

