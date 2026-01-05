import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface Notification {
  id: string
  message: string
  type: NotificationType
  duration?: number
}

interface NotificationContextType {
  notifications: Notification[]
  showNotification: (message: string, type?: NotificationType, duration?: number) => void
  removeNotification: (id: string) => void
}

// Global notification state
let notificationState: Notification[] = []
let listeners: Array<(notifications: Notification[]) => void> = []

const notify = (notifications: Notification[]) => {
  notificationState = notifications
  listeners.forEach(listener => listener(notifications))
}

export const showNotification = (message: string, type: NotificationType = 'info', duration: number = 5000) => {
  const id = Math.random().toString(36).substring(7)
  const notification: Notification = { id, message, type, duration }
  
  notify([...notificationState, notification])
  
  if (duration > 0) {
    setTimeout(() => {
      notify(notificationState.filter(n => n.id !== id))
    }, duration)
  }
  
  return id
}

export const removeNotification = (id: string) => {
  notify(notificationState.filter(n => n.id !== id))
}

export function NotificationContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const listener = (newNotifications: Notification[]) => {
      setNotifications(newNotifications)
    }
    listeners.push(listener)
    setNotifications(notificationState)
    
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }, [])

  if (notifications.length === 0) return null

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  return (
    <div className="fixed top-16 left-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none md:top-4">
      {notifications.map((notification) => {
        const Icon = icons[notification.type]
        return (
          <div
            key={notification.id}
            className={cn(
              'pointer-events-auto max-w-md mx-auto w-full rounded-lg border-2 shadow-2xl p-3 sm:p-4 flex items-start gap-3 animate-in slide-in-from-top-5',
              colors[notification.type]
            )}
          >
            <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium break-words">{notification.message}</p>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="flex-shrink-0 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors p-1.5 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

