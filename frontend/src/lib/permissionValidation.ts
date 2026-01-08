/**
 * Server-Side Permission Validation
 * 
 * This module provides server-side permission validation to prevent client-side bypass.
 * Always use these functions before performing critical operations, in addition to
 * client-side checks. The server-side validation is the authoritative source of truth.
 */

import { supabase } from './supabase'

/**
 * Validates a permission server-side
 * @param permission - Permission name (e.g., 'edit_clients', 'land_view', 'create_sales')
 * @returns Promise<boolean> - true if user has permission, false otherwise
 */
export async function validatePermissionServerSide(permission: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('validate_user_permission', {
      permission_name: permission
    })

    if (error) {
      console.error('Error validating permission server-side:', error)
      // On error, deny access for security
      return false
    }

    return data === true
  } catch (error) {
    console.error('Exception validating permission server-side:', error)
    // On exception, deny access for security
    return false
  }
}

/**
 * Validates multiple permissions server-side (user must have ALL permissions)
 * @param permissions - Array of permission names
 * @returns Promise<boolean> - true if user has ALL permissions, false otherwise
 */
export async function validatePermissionsServerSide(permissions: string[]): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('validate_user_permissions', {
      permission_names: permissions
    })

    if (error) {
      console.error('Error validating permissions server-side:', error)
      return false
    }

    return data === true
  } catch (error) {
    console.error('Exception validating permissions server-side:', error)
    return false
  }
}

/**
 * Validates that user has at least one of the specified permissions
 * @param permissions - Array of permission names
 * @returns Promise<boolean> - true if user has at least one permission, false otherwise
 */
export async function validateAnyPermissionServerSide(permissions: string[]): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('validate_user_any_permission', {
      permission_names: permissions
    })

    if (error) {
      console.error('Error validating any permission server-side:', error)
      return false
    }

    return data === true
  } catch (error) {
    console.error('Exception validating any permission server-side:', error)
    return false
  }
}

/**
 * Validates permission and throws an error if validation fails
 * Useful for operations that should fail fast if permission is denied
 * @param permission - Permission name
 * @param errorMessage - Custom error message (optional)
 * @throws Error if permission is denied
 */
export async function requirePermission(
  permission: string,
  errorMessage?: string
): Promise<void> {
  const hasPermission = await validatePermissionServerSide(permission)
  
  if (!hasPermission) {
    throw new Error(
      errorMessage || `Permission denied: ${permission}. You do not have the required permission to perform this operation.`
    )
  }
}

/**
 * Validates multiple permissions and throws an error if validation fails
 * @param permissions - Array of permission names
 * @param errorMessage - Custom error message (optional)
 * @throws Error if any permission is denied
 */
export async function requirePermissions(
  permissions: string[],
  errorMessage?: string
): Promise<void> {
  const hasPermissions = await validatePermissionsServerSide(permissions)
  
  if (!hasPermissions) {
    throw new Error(
      errorMessage || `Permission denied: Missing required permissions. You do not have the required permissions to perform this operation.`
    )
  }
}

