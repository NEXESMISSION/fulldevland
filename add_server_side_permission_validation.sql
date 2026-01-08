-- ============================================
-- SERVER-SIDE PERMISSION VALIDATION ENHANCEMENT
-- Adds server-side validation functions to prevent client-side bypass
-- ============================================

-- Enhanced function to check if user has permission (server-side validation)
-- This function is called from the frontend to validate permissions server-side
-- before performing critical operations
CREATE OR REPLACE FUNCTION validate_user_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_id_val UUID;
    user_role_val user_role;
    user_status_val user_status;
    role_permissions JSONB;
    custom_permission BOOLEAN;
    resource_type_val TEXT;
    permission_type_val TEXT;
BEGIN
    -- Get current authenticated user
    user_id_val := auth.uid();
    
    -- If no authenticated user, deny access
    IF user_id_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get user role and status
    SELECT role, status INTO user_role_val, user_status_val
    FROM users 
    WHERE id = user_id_val;
    
    -- If user not found or not active, deny access
    IF user_role_val IS NULL OR user_status_val != 'Active' THEN
        RETURN FALSE;
    END IF;
    
    -- Owner always has all permissions
    IF user_role_val = 'Owner' THEN
        RETURN TRUE;
    END IF;
    
    -- Parse permission name (supports both formats)
    -- New format: "land_view", "sale_create", "client_edit", etc.
    -- Legacy format: "view_land", "create_sales", "edit_clients", etc.
    
    -- Try to extract resource and permission type (new format)
    resource_type_val := SPLIT_PART(permission_name, '_', 1);
    permission_type_val := SPLIT_PART(permission_name, '_', 2);
    
    -- Check custom user permissions first (new format)
    SELECT granted INTO custom_permission
    FROM user_permissions
    WHERE user_id = user_id_val
      AND resource_type = resource_type_val
      AND permission_type = permission_type_val;
    
    IF custom_permission IS NOT NULL THEN
        RETURN custom_permission;
    END IF;
    
    -- Check role permissions (try both formats)
    SELECT permissions INTO role_permissions 
    FROM roles 
    WHERE name = user_role_val;
    
    IF role_permissions IS NOT NULL THEN
        -- Try new format first (e.g., "land_view")
        IF (role_permissions ->> permission_name)::BOOLEAN = TRUE THEN
            RETURN TRUE;
        END IF;
        
        -- Try legacy format (e.g., "view_land")
        IF (role_permissions ->> (permission_type_val || '_' || resource_type_val))::BOOLEAN = TRUE THEN
            RETURN TRUE;
        END IF;
        
        -- Also check if it's already in legacy format
        IF permission_name LIKE 'view_%' OR permission_name LIKE 'create_%' OR 
           permission_name LIKE 'edit_%' OR permission_name LIKE 'delete_%' OR
           permission_name LIKE 'manage_%' OR permission_name LIKE 'record_%' THEN
            IF (role_permissions ->> permission_name)::BOOLEAN = TRUE THEN
                RETURN TRUE;
            END IF;
        END IF;
    END IF;
    
    -- Default: deny access
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION validate_user_permission(TEXT) TO authenticated;

-- Create a function to validate multiple permissions (for operations requiring multiple permissions)
CREATE OR REPLACE FUNCTION validate_user_permissions(permission_names TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    permission_name TEXT;
BEGIN
    -- Check all permissions - user must have ALL of them
    FOREACH permission_name IN ARRAY permission_names
    LOOP
        IF NOT validate_user_permission(permission_name) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION validate_user_permissions(TEXT[]) TO authenticated;

-- Create a function to validate at least one permission (for operations requiring ANY of multiple permissions)
CREATE OR REPLACE FUNCTION validate_user_any_permission(permission_names TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    permission_name TEXT;
BEGIN
    -- Check permissions - user must have AT LEAST ONE of them
    FOREACH permission_name IN ARRAY permission_names
    LOOP
        IF validate_user_permission(permission_name) THEN
            RETURN TRUE;
        END IF;
    END LOOP;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION validate_user_any_permission(TEXT[]) TO authenticated;

-- Add comment explaining the purpose
COMMENT ON FUNCTION validate_user_permission(TEXT) IS 
'Server-side permission validation function. Called from frontend before critical operations to prevent client-side bypass. Returns TRUE if user has the permission, FALSE otherwise.';

COMMENT ON FUNCTION validate_user_permissions(TEXT[]) IS 
'Validates that user has ALL specified permissions. Used for operations requiring multiple permissions.';

COMMENT ON FUNCTION validate_user_any_permission(TEXT[]) IS 
'Validates that user has AT LEAST ONE of the specified permissions. Used for operations with alternative permission requirements.';

-- Verify functions are created
DO $$
BEGIN
    RAISE NOTICE 'Server-side permission validation functions created successfully';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '  - validate_user_permission(permission_name TEXT)';
    RAISE NOTICE '  - validate_user_permissions(permission_names TEXT[])';
    RAISE NOTICE '  - validate_user_any_permission(permission_names TEXT[])';
END $$;

