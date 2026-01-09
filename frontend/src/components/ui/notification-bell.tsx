import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Bell, MessageSquare, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { Notification, Conversation, User as UserType } from '@/types/database'
import { formatDate } from '@/lib/utils'

interface GroupedNotification {
  conversationId: string | null
  count: number
  latestNotification: Notification
  isRead: boolean
  senderName?: string
}

export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [conversationDetails, setConversationDetails] = useState<Map<string, { senderName: string }>>(new Map())
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  const fetchNotifications = async (isRetry = false) => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        // Don't retry for certain error types
        if (error.code === 'PGRST116' || error.message?.includes('JWT')) {
          console.warn('Notification fetch failed (auth issue):', error.message)
          return
        }
        throw error
      }

      setNotifications((data as Notification[]) || [])
      
      // Count unique conversations with unread messages (not per message, per conversation/user)
      const unreadNotifications = (data || []).filter(n => !n.is_read && n.type === 'new_message')
      const uniqueConversations = new Set(unreadNotifications.map(n => n.reference_id).filter(Boolean))
      setUnreadCount(uniqueConversations.size)
      setRetryCount(0) // Reset retry count on success
    } catch (error: any) {
      const currentRetry = isRetry ? retryCount + 1 : 0
      if (currentRetry < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        const delay = Math.pow(2, currentRetry) * 1000
        console.warn(`Notification fetch failed, retrying in ${delay}ms (attempt ${currentRetry + 1}/${maxRetries}):`, error.message)
        setRetryCount(currentRetry + 1)
        setTimeout(() => {
          fetchNotifications(true)
        }, delay)
      } else {
        console.error('Error fetching notifications (max retries reached):', error)
        // Set empty state on persistent failure
        setNotifications([])
        setUnreadCount(0)
        setRetryCount(0)
      }
    }
  }

  useEffect(() => {
    if (!user) return

    let isMounted = true

    fetchNotifications()
    
    // Set up real-time subscription for notifications
    let channel: any = null
    try {
      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Only fetch if component is still mounted
            if (isMounted) {
              fetchNotifications()
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('Notifications subscription active')
          } else if (status === 'CHANNEL_ERROR') {
            // Silently handle subscription errors - will retry on next fetch automatically
            // Only log in development mode to reduce console noise
            if (import.meta.env.DEV) {
              console.debug('Notifications subscription error, will retry on next fetch')
            }
          }
        })
    } catch (err) {
      console.warn('Failed to set up notifications subscription:', err)
    }

    // Poll every 30 seconds as backup (only if subscription might have failed)
    const interval = setInterval(() => {
      if (isMounted) {
        fetchNotifications()
      }
    }, 30000)

    return () => {
      isMounted = false
      clearInterval(interval)
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user])

  // Fetch conversation details for grouped notifications
  useEffect(() => {
    if (!user || notifications.length === 0) return

    const messageNotifications = notifications.filter(n => n.type === 'new_message')
    const convIds = [...new Set(messageNotifications.map(n => n.reference_id).filter(Boolean))] as string[]
    
    if (convIds.length === 0) return

    const fetchConversationDetails = async () => {
      try {
        const { data: conversations, error } = await supabase
          .from('conversations')
          .select(`
            id,
            created_by,
            worker_id,
            creator:users!conversations_created_by_fkey(id, name, email),
            worker:users!conversations_worker_id_fkey(id, name, email)
          `)
          .in('id', convIds)
        
        if (error) throw error
        
        const detailsMap = new Map<string, { senderName: string }>()
        conversations?.forEach((conv: any) => {
          // Determine the other user (not the current user)
          const otherUser = conv.created_by === user.id 
            ? conv.worker 
            : conv.creator
          detailsMap.set(conv.id, {
            senderName: otherUser?.name || otherUser?.email || 'مستخدم غير معروف'
          })
        })
        
        setConversationDetails(detailsMap)
      } catch (error) {
        console.error('Error fetching conversation details:', error)
      }
    }
    
    fetchConversationDetails()
  }, [notifications, user?.id])

  // Group notifications by conversation/user (like social media apps)
  const groupedNotifications = useMemo(() => {
    const messageNotifications = notifications.filter(n => n.type === 'new_message')
    const otherNotifications = notifications.filter(n => n.type !== 'new_message')
    
    // Group message notifications by conversation_id (reference_id)
    const grouped = new Map<string | null, GroupedNotification>()
    
    for (const notif of messageNotifications) {
      const convId = notif.reference_id
      if (grouped.has(convId)) {
        const existing = grouped.get(convId)!
        existing.count++
        // Keep the latest notification
        if (new Date(notif.created_at) > new Date(existing.latestNotification.created_at)) {
          existing.latestNotification = notif
        }
        // If any notification in group is unread, mark group as unread
        if (!notif.is_read) {
          existing.isRead = false
        }
      } else {
        grouped.set(convId, {
          conversationId: convId,
          count: 1,
          latestNotification: notif,
          isRead: notif.is_read,
          senderName: undefined,
        })
      }
    }
    
    // Add sender names from fetched conversation details
    grouped.forEach((group, convId) => {
      if (convId && conversationDetails.has(convId)) {
        group.senderName = conversationDetails.get(convId)!.senderName
      }
    })
    
    // Convert to array and sort by latest notification date
    const groupedArray = Array.from(grouped.values())
      .sort((a, b) => 
        new Date(b.latestNotification.created_at).getTime() - 
        new Date(a.latestNotification.created_at).getTime()
      )
    
    // Add other notifications (non-message) at the end
    const otherArray = otherNotifications.map(n => ({
      conversationId: null,
      count: 1,
      latestNotification: n,
      isRead: n.is_read,
      senderName: undefined,
    }))
    
    return [...groupedArray, ...otherArray]
  }, [notifications, conversationDetails])

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error: any) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    if (!user) return

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error: any) {
      console.error('Error marking all as read:', error)
    }
  }

  const handleNotificationClick = async (grouped: GroupedNotification) => {
    // Mark all notifications in the group as read
    if (grouped.conversationId) {
      // Mark all unread notifications for this conversation as read
      const toMark = notifications.filter(
        n => n.reference_id === grouped.conversationId && !n.is_read && n.type === 'new_message'
      )
      await Promise.all(toMark.map(n => markAsRead(n.id)))
    } else {
      await markAsRead(grouped.latestNotification.id)
    }

    if (grouped.latestNotification.type === 'new_message' && grouped.conversationId) {
      navigate(`/messages?conversation=${grouped.conversationId}`)
      setOpen(false)
    }
  }

  const getNotificationLabel = (type: string) => {
    switch (type) {
      case 'new_message':
        return 'رسالة جديدة'
      case 'task_update':
        return 'تحديث مهمة'
      case 'system':
        return 'إشعار نظام'
      default:
        return 'إشعار'
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setOpen(true)
          fetchNotifications()
        }}
        className="relative hover:bg-accent h-9 w-9 shrink-0"
        title="الإشعارات"
      >
        {unreadCount > 0 ? (
          <AlertCircle className="h-5 w-5 text-destructive" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-background shadow-lg animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="notification-dialog max-w-md w-[95vw] sm:w-full max-h-[90vh] sm:max-h-[85vh] p-0 flex flex-col">
          {/* Header */}
          <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b bg-gradient-to-r from-muted/50 to-background">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-base sm:text-lg font-bold m-0">الإشعارات</DialogTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs h-7 sm:h-8 px-2 sm:px-3 shrink-0"
                >
                  <span className="hidden sm:inline">تحديد الكل كمقروء</span>
                  <span className="sm:hidden">الكل</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                <p className="text-sm">جاري التحميل...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 sm:py-16 px-4">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Bell className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground/40" />
                </div>
                <p className="text-muted-foreground font-medium text-sm sm:text-base">لا توجد إشعارات</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">ستظهر الإشعارات هنا عند وصولها</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {groupedNotifications.map((grouped, index) => {
                  const notification = grouped.latestNotification
                  const isMessageGroup = notification.type === 'new_message' && grouped.count > 1
                  
                  return (
                    <div
                      key={grouped.conversationId || notification.id || index}
                      className={`
                        group relative px-3 sm:px-4 md:px-6 py-3 sm:py-4 cursor-pointer transition-all
                        ${!grouped.isRead 
                          ? 'bg-primary/5 hover:bg-primary/10 border-r-2 border-r-primary' 
                          : 'hover:bg-muted/30'
                        }
                      `}
                      onClick={() => handleNotificationClick(grouped)}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* Avatar/Icon */}
                        <div className={`
                          flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center
                          ${notification.type === 'new_message' 
                            ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20' 
                            : notification.type === 'task_update'
                            ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20'
                            : 'bg-muted text-muted-foreground'
                          }
                        `}>
                          {notification.type === 'new_message' ? (
                            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
                          ) : (
                            <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              {isMessageGroup ? (
                                <p className={`
                                  font-semibold text-sm sm:text-base leading-tight
                                  ${!grouped.isRead ? 'text-foreground' : 'text-muted-foreground'}
                                `}>
                                  <span className="text-primary">{grouped.count}</span> رسائل جديدة
                                  {grouped.senderName && (
                                    <span className="block sm:inline text-muted-foreground font-normal text-xs sm:text-sm mt-0.5 sm:mt-0 sm:mr-1">
                                      من <span className="font-medium">{grouped.senderName}</span>
                                    </span>
                                  )}
                                </p>
                              ) : (
                                <p className={`
                                  font-semibold text-sm sm:text-base leading-tight
                                  ${!grouped.isRead ? 'text-foreground' : 'text-muted-foreground'}
                                `}>
                                  {getNotificationLabel(notification.type)}
                                  {grouped.senderName && notification.type === 'new_message' && (
                                    <span className="block sm:inline text-muted-foreground font-normal text-xs sm:text-sm mt-0.5 sm:mt-0 sm:mr-1">
                                      من <span className="font-medium">{grouped.senderName}</span>
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                            {!grouped.isRead && (
                              <div className="h-2 w-2 bg-primary rounded-full shrink-0 mt-1.5 sm:mt-2 animate-pulse"></div>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

