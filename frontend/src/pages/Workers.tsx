import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function Workers() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()

  useEffect(() => {
    // Redirect to Users page - workers are managed there
    if (hasPermission('manage_users')) {
      navigate('/users', { replace: true })
    }
  }, [navigate, hasPermission])

  // Show loading message while redirecting
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">جاري التوجيه إلى صفحة المستخدمين...</p>
      </div>
    </div>
  )
}

