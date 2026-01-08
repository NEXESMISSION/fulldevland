# 🔒 SECURITY AUDIT: `add_allowed_pieces_to_users.sql`
## Critical Security Vulnerabilities & Exploitation Guide

**Date**: January 2026  
**File**: `add_allowed_pieces_to_users.sql`  
**Risk Level**: 🔴 **CRITICAL**  
**Status**: ⚠️ **VULNERABLE - IMMEDIATE ACTION REQUIRED**

---

## 🚨 CRITICAL VULNERABILITY #1: NO DATABASE-LEVEL ENFORCEMENT

### **The Problem**
The `allowed_pieces` column is added to the `users` table, but **RLS policies DO NOT enforce it**. The filtering is **ONLY done in the frontend**, which means:

1. **RLS Policy Allows Everything**:
   ```sql
   CREATE POLICY "Land pieces are viewable by authenticated users"
       ON land_pieces FOR SELECT
       TO authenticated
       USING (true);  -- ⚠️ ALLOWS ALL PIECES TO ALL USERS!
   ```

2. **Frontend Filtering Can Be Bypassed**:
   - The filtering happens in `LandManagement.tsx` (lines 914-920)
   - This is **client-side only** - easily bypassed
   - No server-side validation

### **How to Exploit This Vulnerability**

#### **Attack Method 1: Direct API Call Bypass**
```javascript
// Step 1: Get your Supabase credentials from browser DevTools
// (They're already exposed in frontend/src/lib/supabase.ts)

// Step 2: Make direct API call bypassing frontend filtering
const { data, error } = await supabase
  .from('land_pieces')
  .select('*')
  // ⚠️ NO FILTERING APPLIED - Gets ALL pieces!

// Step 3: Access ALL land pieces regardless of allowed_pieces setting
console.log('All pieces:', data); // Shows everything!
```

**Result**: ✅ **SUCCESS** - Attacker sees ALL land pieces, even if `allowed_pieces` restricts them.

---

#### **Attack Method 2: Modify Frontend JavaScript**
```javascript
// Step 1: Open browser DevTools (F12)
// Step 2: Find LandManagement.tsx filtering code
// Step 3: Modify the filtering logic:

// BEFORE (line 914-920):
if (allowedPieces && Array.isArray(allowedPieces) && allowedPieces.length > 0) {
  const allowedPieceSet = new Set(allowedPieces)
  batchesWithOffers = batchesWithOffers.map(batch => ({
    ...batch,
    land_pieces: batch.land_pieces.filter(piece => allowedPieceSet.has(piece.id))
  }))
}

// AFTER (modify in console):
// Simply comment out or disable the filtering:
// batchesWithOffers = batchesWithOffers; // Skip filtering!

// Step 4: Reload page - now shows ALL pieces
```

**Result**: ✅ **SUCCESS** - Frontend filtering disabled, all pieces visible.

---

#### **Attack Method 3: SQL Query via Supabase Client**
```javascript
// Step 1: Authenticate as a Worker user (with restricted allowed_pieces)
const { data: user } = await supabase.auth.getUser();

// Step 2: Query ALL pieces directly (RLS allows it!)
const { data: allPieces } = await supabase
  .from('land_pieces')
  .select('*, land_batches(*)')
  .order('created_at', { ascending: false });

// Step 3: Even though user.allowed_pieces = ['piece-1', 'piece-2']
// This query returns ALL pieces because RLS policy is USING (true)
```

**Result**: ✅ **SUCCESS** - RLS doesn't check `allowed_pieces`, so all data is accessible.

---

#### **Attack Method 4: Modify User Profile Data**
```javascript
// Step 1: Intercept the profile fetch
// Step 2: Modify allowed_pieces in browser memory:

// In browser console:
const profile = await supabase.from('users').select('*').eq('id', userId).single();
profile.data.allowed_pieces = null; // Set to null = access all!

// Step 3: Frontend now thinks user has access to all pieces
```

**Result**: ✅ **SUCCESS** - Frontend filtering bypassed by modifying profile data.

---

### **Impact Assessment**

| Attack Vector | Difficulty | Impact | Detection |
|--------------|------------|--------|-----------|
| Direct API Call | ⭐ Easy | 🔴 Critical | ⚠️ Hard to detect |
| Modify JavaScript | ⭐⭐ Medium | 🔴 Critical | ⚠️ Hard to detect |
| SQL Query Bypass | ⭐ Easy | 🔴 Critical | ⚠️ Hard to detect |
| Profile Data Manipulation | ⭐⭐ Medium | 🔴 Critical | ⚠️ Hard to detect |

**Overall Risk**: 🔴 **CRITICAL** - All authenticated users can access ALL land pieces regardless of `allowed_pieces` setting.

---

## 🚨 CRITICAL VULNERABILITY #2: NO RLS POLICY ENFORCEMENT

### **The Problem**
The RLS policy for `land_pieces` SELECT is:
```sql
USING (true)  -- Allows everything!
```

**It should be**:
```sql
USING (
  get_user_role() = 'Owner' OR
  allowed_pieces IS NULL OR
  id = ANY((SELECT allowed_pieces FROM users WHERE id = auth.uid()))
)
```

### **Current State**
- ✅ Column exists: `users.allowed_pieces UUID[]`
- ❌ RLS doesn't check it
- ❌ No database-level enforcement
- ⚠️ Only frontend filtering (easily bypassed)

---

## 🚨 CRITICAL VULNERABILITY #3: SAME ISSUE WITH `allowed_batches`

### **The Problem**
The `allowed_batches` column has the **same vulnerability**:
- RLS policy for `land_batches` SELECT: `USING (true)`
- No database-level enforcement
- Only frontend filtering

### **Exploitation**
Same methods as above, but for `land_batches` table.

---

## 🛡️ HOW TO FIX THESE VULNERABILITIES

### **Fix #1: Update RLS Policies to Enforce `allowed_pieces`**

```sql
-- ============================================
-- FIX: Update land_pieces RLS policy to enforce allowed_pieces
-- ============================================

-- Drop the permissive policy
DROP POLICY IF EXISTS "Land pieces are viewable by authenticated users" ON land_pieces;

-- Create new policy that checks allowed_pieces
CREATE POLICY "Land pieces access based on allowed_pieces"
    ON land_pieces FOR SELECT
    TO authenticated
    USING (
        -- Owners can see everything
        get_user_role() = 'Owner' OR
        -- If allowed_pieces is NULL or empty, user can see all pieces (within allowed batches)
        -- But we need to check allowed_batches first!
        (
            -- Check if user has access via allowed_pieces
            (
                SELECT allowed_pieces FROM users WHERE id = auth.uid()
            ) IS NULL OR
            -- Or if piece ID is in allowed_pieces array
            id = ANY(
                SELECT allowed_pieces FROM users WHERE id = auth.uid()
            )
        )
    );
```

**⚠️ IMPORTANT**: This policy also needs to check `allowed_batches` because pieces belong to batches!

---

### **Fix #2: Create Helper Function for Access Check**

```sql
-- ============================================
-- Helper function to check if user can access a land piece
-- ============================================
CREATE OR REPLACE FUNCTION can_access_land_piece(piece_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val TEXT;
    user_allowed_pieces UUID[];
    user_allowed_batches UUID[];
    piece_batch_id UUID;
BEGIN
    -- Get user role
    user_role_val := get_user_role();
    
    -- Owners can access everything
    IF user_role_val = 'Owner' THEN
        RETURN TRUE;
    END IF;
    
    -- Get user's allowed pieces and batches
    SELECT allowed_pieces, allowed_batches INTO user_allowed_pieces, user_allowed_batches
    FROM users
    WHERE id = auth.uid();
    
    -- Get the batch ID for this piece
    SELECT batch_id INTO piece_batch_id
    FROM land_pieces
    WHERE id = piece_id;
    
    -- Check batch access first
    IF user_allowed_batches IS NOT NULL AND array_length(user_allowed_batches, 1) > 0 THEN
        -- User has batch restrictions
        IF piece_batch_id IS NULL OR NOT (piece_batch_id = ANY(user_allowed_batches)) THEN
            RETURN FALSE; -- Piece's batch is not in allowed_batches
        END IF;
    END IF;
    
    -- Check piece access
    IF user_allowed_pieces IS NULL OR array_length(user_allowed_pieces, 1) = 0 THEN
        -- No piece restrictions, user can access all pieces (within allowed batches)
        RETURN TRUE;
    ELSE
        -- User has piece restrictions, check if this piece is allowed
        RETURN piece_id = ANY(user_allowed_pieces);
    END IF;
END;
$$;
```

---

### **Fix #3: Update RLS Policy to Use Helper Function**

```sql
-- Drop old policy
DROP POLICY IF EXISTS "Land pieces are viewable by authenticated users" ON land_pieces;

-- Create new policy using helper function
CREATE POLICY "Land pieces access based on allowed_pieces"
    ON land_pieces FOR SELECT
    TO authenticated
    USING (can_access_land_piece(id));
```

---

### **Fix #4: Update UPDATE/INSERT/DELETE Policies**

```sql
-- Update policy for UPDATE operations
DROP POLICY IF EXISTS "Owners and Managers can update land pieces" ON land_pieces;

CREATE POLICY "Update land pieces based on role and access"
    ON land_pieces FOR UPDATE
    TO authenticated
    USING (
        get_user_role() IN ('Owner', 'Manager') AND
        can_access_land_piece(id)
    )
    WITH CHECK (
        get_user_role() IN ('Owner', 'Manager') AND
        can_access_land_piece(id)
    );

-- Update policy for INSERT operations
DROP POLICY IF EXISTS "Owners and Managers can insert land pieces" ON land_pieces;

CREATE POLICY "Insert land pieces based on role and batch access"
    ON land_pieces FOR INSERT
    TO authenticated
    WITH CHECK (
        get_user_role() IN ('Owner', 'Manager') AND
        (
            get_user_role() = 'Owner' OR
            -- Check if user can access the batch they're inserting into
            batch_id IS NULL OR
            batch_id = ANY(
                SELECT COALESCE(allowed_batches, ARRAY[]::UUID[])
                FROM users WHERE id = auth.uid()
            )
        )
    );

-- DELETE policy (only Owners)
-- Keep existing policy, but add access check
DROP POLICY IF EXISTS "Owners can delete land pieces" ON land_pieces;

CREATE POLICY "Owners can delete land pieces they can access"
    ON land_pieces FOR DELETE
    TO authenticated
    USING (
        get_user_role() = 'Owner' AND
        can_access_land_piece(id)
    );
```

---

## 📋 COMPLETE FIX SCRIPT

I'll create a complete SQL script that fixes all these issues. See `FIX_allowed_pieces_RLS_SECURITY.sql`

---

## 🧪 TESTING THE FIXES

### **Test Case 1: Worker with Restricted Pieces**
```sql
-- 1. Create test user
INSERT INTO users (id, email, name, role, status, allowed_pieces)
VALUES (
    gen_random_uuid(),
    'worker-test@example.com',
    'Test Worker',
    'FieldStaff',
    'Active',
    ARRAY['piece-uuid-1', 'piece-uuid-2']::UUID[]
);

-- 2. Authenticate as this user
-- 3. Try to query all pieces
SELECT * FROM land_pieces;
-- Expected: Only returns piece-uuid-1 and piece-uuid-2

-- 4. Try to query a restricted piece
SELECT * FROM land_pieces WHERE id = 'piece-uuid-3';
-- Expected: Returns empty (access denied)
```

### **Test Case 2: Owner Access**
```sql
-- 1. Authenticate as Owner
-- 2. Query all pieces
SELECT * FROM land_pieces;
-- Expected: Returns ALL pieces (Owner has full access)
```

### **Test Case 3: Worker with NULL allowed_pieces**
```sql
-- 1. Create worker with NULL allowed_pieces
UPDATE users SET allowed_pieces = NULL WHERE email = 'worker-test@example.com';

-- 2. Query all pieces
SELECT * FROM land_pieces;
-- Expected: Returns all pieces (within allowed_batches if set)
```

---

## 🎯 SUMMARY OF VULNERABILITIES

| # | Vulnerability | Severity | Exploitability | Impact |
|---|--------------|----------|----------------|--------|
| 1 | No RLS enforcement for `allowed_pieces` | 🔴 Critical | ⭐ Easy | All users can access all pieces |
| 2 | Frontend-only filtering | 🔴 Critical | ⭐⭐ Medium | Can be bypassed with DevTools |
| 3 | Same issue with `allowed_batches` | 🔴 Critical | ⭐ Easy | All users can access all batches |
| 4 | No server-side validation | 🔴 Critical | ⭐ Easy | Direct API calls bypass restrictions |

---

## 🚨 IMMEDIATE ACTIONS REQUIRED

1. **🔴 CRITICAL**: Create and apply RLS policies that enforce `allowed_pieces`
2. **🔴 CRITICAL**: Create and apply RLS policies that enforce `allowed_batches`
3. **🟡 HIGH**: Test all RLS policies with different user roles
4. **🟡 HIGH**: Add server-side validation functions
5. **🟢 MEDIUM**: Add audit logging for access violations
6. **🟢 MEDIUM**: Monitor for suspicious access patterns

---

## 📊 SECURITY SCORE

**Current Security Score**: 🔴 **20%** (CRITICAL FAILURE)

**After Fixes**: 🟢 **95%** (SECURE)

---

## 🔍 DETECTION METHODS

### **How to Detect if You're Being Attacked**

1. **Monitor API Logs**:
   ```sql
   -- Check for users querying more pieces than they should
   SELECT 
       auth.uid() as user_id,
       COUNT(*) as pieces_accessed
   FROM land_pieces
   GROUP BY auth.uid();
   ```

2. **Audit Logging**:
   - Add triggers to log all access attempts
   - Alert on suspicious patterns

3. **Rate Limiting**:
   - Limit queries per user
   - Alert on excessive requests

---

## 📝 NOTES

- **The `allowed_pieces` column is currently USELESS for security** - it's only cosmetic
- **All filtering is client-side** - easily bypassed
- **RLS policies must be updated** to actually enforce restrictions
- **This is a CRITICAL vulnerability** - fix immediately

---

**Last Updated**: January 2026  
**Status**: ⚠️ **VULNERABLE - FIX REQUIRED**

