import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Send, Plus, MessageSquare, ArrowRight, X, ArrowLeft, Search, MoreVertical, Menu } from 'lucide-react'
import type { Conversation, Message, User as UserType, WorkerProfile } from '@/types/database'
import { sanitizeText } from '@/lib/sanitize'
import { showNotification } from '@/components/ui/notification'
import { formatDate } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'

interface ConversationWithParticipants extends Conversation {
  creator: UserType
  worker: UserType
  last_message?: Message
  unread_count?: number
}

interface MessageWithSender extends Message {
  sender: UserType
}

export function Messages() {
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const conversationId = searchParams.get('conversation')
  const workerId = searchParams.get('worker')

  const [conversations, setConversations] = useState<ConversationWithParticipants[]>([])
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithParticipants | null>(null)
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [workers, setWorkers] = useState<Array<UserType & { worker_profile?: WorkerProfile }>>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showConversations, setShowConversations] = useState(false) // For mobile: show/hide conversation list
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false) // For burger menu
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set()) // Track read messages
  const [hasMoreMessages, setHasMoreMessages] = useState(false) // For pagination
  const [messagesPage, setMessagesPage] = useState(1) // Current page for messages
  const MESSAGES_PER_PAGE = 20 // Load 20 messages at a time

  // New conversation dialog
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [newConversationForm, setNewConversationForm] = useState({
    worker_id: workerId || '',
    subject: '',
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<{ id: string | null; count: number }>({ id: null, count: 0 })
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const messageTextRef = useRef('') // Backup ref for message text to prevent loss during updates

  useEffect(() => {
    fetchConversations()
    if (workerId) {
      setNewConversationOpen(true)
    }

    // Set up real-time subscription for conversations
    const channelName = `conversations-${user?.id}`

    const conversationsChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `created_by=eq.${user?.id}`,
        },
        (payload) => {
          // Update specific conversation in list (smooth update, no full refresh)
          if (payload.new) {
            const updatedConv = payload.new as any
            setConversations(prev => {
              const existing = prev.find(c => c.id === updatedConv.id)
              if (existing) {
                return prev.map(conv => 
                  conv.id === updatedConv.id 
                    ? { ...conv, ...updatedConv, updated_at: updatedConv.updated_at || conv.updated_at }
                    : conv
                ).sort((a, b) => 
                  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
              }
              return prev
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `worker_id=eq.${user?.id}`,
        },
        (payload) => {
          // Update specific conversation in list (smooth update, no full refresh)
          if (payload.new) {
            const updatedConv = payload.new as any
            setConversations(prev => {
              const existing = prev.find(c => c.id === updatedConv.id)
              if (existing) {
                return prev.map(conv => 
                  conv.id === updatedConv.id 
                    ? { ...conv, ...updatedConv, updated_at: updatedConv.updated_at || conv.updated_at }
                    : conv
                ).sort((a, b) => 
                  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
              }
              return prev
            })
          }
        }
      )
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'conversations',
                filter: `created_by=eq.${user?.id}`,
              },
              async (payload) => {
                // Fetch new conversation with full details
                if (payload.new) {
                  const { data: newConv } = await supabase
                    .from('conversations')
                    .select(`
                      *,
                      creator:users!conversations_created_by_fkey(id, name, email, role, status, created_at, updated_at),
                      worker:users!conversations_worker_id_fkey(id, name, email, role, status, created_at, updated_at)
                    `)
                    .eq('id', payload.new.id)
                    .single()
                  
                  if (newConv) {
                    setConversations(prev => {
                      const exists = prev.find(c => c.id === newConv.id)
                      if (exists) return prev
                      return [newConv as ConversationWithParticipants, ...prev]
                    })
                  }
                }
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'conversations',
                filter: `worker_id=eq.${user?.id}`,
              },
              async (payload) => {
                // Fetch new conversation with full details
                if (payload.new) {
                  const { data: newConv } = await supabase
                    .from('conversations')
                    .select(`
                      *,
                      creator:users!conversations_created_by_fkey(id, name, email, role, status, created_at, updated_at),
                      worker:users!conversations_worker_id_fkey(id, name, email, role, status, created_at, updated_at)
                    `)
                    .eq('id', payload.new.id)
                    .single()
                  
                  if (newConv) {
                    setConversations(prev => {
                      const exists = prev.find(c => c.id === newConv.id)
                      if (exists) return prev
                      return [newConv as ConversationWithParticipants, ...prev]
                    })
                  }
                }
              }
            )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          // When a new message is inserted, update the conversation in the list
          if (payload.new) {
            const newMessage = payload.new as any
            const convId = newMessage.conversation_id
            
            // Check if this conversation is in our list
            setConversations(prev => {
              const conv = prev.find(c => c.id === convId)
              if (conv) {
                // Fetch the message with sender data
                supabase
                  .from('messages')
                  .select(`
                    *,
                    sender:users!messages_sender_id_fkey(id, name, email, role, status, created_at, updated_at)
                  `)
                  .eq('id', newMessage.id)
                  .single()
                  .then(({ data: fullMessage }) => {
                    if (fullMessage) {
                      // Update conversation with new last message
                      setConversations(prevConvs => prevConvs.map(c => {
                        if (c.id === convId) {
                          return {
                            ...c,
                            last_message: fullMessage as any,
                            updated_at: fullMessage.created_at,
                            unread_count: c.unread_count !== undefined ? c.unread_count + 1 : 1,
                          }
                        }
                        return c
                      }).sort((a, b) => 
                        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                      ))
                    }
                  })
              }
              return prev
            })
          }
        }
      )
      .subscribe()

    // No polling - rely only on real-time subscriptions for updates

    return () => {
      supabase.removeChannel(conversationsChannel)
    }
  }, [user?.id])

  useEffect(() => {
    if (conversationId) {
      const conv = conversations.find(c => c.id === conversationId)
      if (conv) {
        selectConversation(conv)
        setShowConversations(false) // Hide conversation list on mobile when conversation is selected
      } else {
        // Fetch conversation if not in list
        fetchConversationById(conversationId)
      }
    } else {
      // No conversation selected - show conversation list on mobile for non-owners
      if (profile?.role !== 'Owner') {
        setShowConversations(true)
      }
    }
  }, [conversationId, conversations, profile?.role])

  // Scroll to bottom when messages change (only if user is at bottom)
  useEffect(() => {
    if (messages.length > 0 && shouldAutoScrollRef.current) {
      // Use instant scroll on initial load, smooth for new messages
      const isInitialLoad = messages.length === 1 || loadingMessages
      scrollToBottom(isInitialLoad)
    }
  }, [messages.length, loadingMessages])

  const scrollToBottom = (instant = false, force = false) => {
    // Only auto-scroll if user hasn't manually scrolled up (unless forced)
    if (!force && !shouldAutoScrollRef.current) {
      return
    }

    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      const container = document.getElementById('messages-container')
      if (container) {
        // Direct scroll to bottom (most reliable method)
        container.scrollTop = container.scrollHeight
        // Update auto-scroll flag
        shouldAutoScrollRef.current = true
      }
      // Also try scrollIntoView as backup
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ 
          behavior: instant ? 'auto' : 'smooth',
          block: 'end',
          inline: 'nearest'
        })
      }
    }, instant ? 50 : 150)
  }

  // Update conversation in list without full refresh (smooth update)
  const updateConversationInList = useCallback((conversationId: string, updates: Partial<ConversationWithParticipants>) => {
    setConversations(prev => {
      const updated = prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            ...updates,
            updated_at: updates.updated_at || conv.updated_at,
          }
        }
        return conv
      })
      // Re-sort by updated_at
      return updated.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
    })
  }, [])

  const fetchConversations = async (showLoading = true, silent = false) => {
    if (showLoading && !silent) {
      setLoading(true)
    }
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          creator:users!conversations_created_by_fkey(*),
          worker:users!conversations_worker_id_fkey(*)
        `)
        .or(`created_by.eq.${user?.id},worker_id.eq.${user?.id}`)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // Only fetch last message and unread count if not silent (for performance)
      const conversationsWithDetails = silent 
        ? (data || []).map((conv: any) => ({
            ...conv,
            last_message: conversations.find(c => c.id === conv.id)?.last_message,
            unread_count: conversations.find(c => c.id === conv.id)?.unread_count || 0,
          }))
        : await Promise.all(
            (data || []).map(async (conv: any) => {
              // Get last message
              const { data: lastMsg } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              // Get unread count
              const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user?.id)
                .eq('reference_id', conv.id)
                .eq('is_read', false)
                .eq('type', 'new_message')

              return {
                ...conv,
                last_message: lastMsg || undefined,
                unread_count: count || 0,
              }
            })
          )

      // Smooth update: only update if there are actual changes
      setConversations(prev => {
        // If silent update, merge with existing data to preserve last_message and unread_count
        if (silent) {
          const updated = conversationsWithDetails.map((newConv: any) => {
            const existing = prev.find(c => c.id === newConv.id)
            return {
              ...newConv,
              last_message: existing?.last_message || newConv.last_message,
              unread_count: existing?.unread_count || newConv.unread_count,
            }
          })
          // Add any new conversations
          const newConvs = conversationsWithDetails.filter(
            (newConv: any) => !prev.some(c => c.id === newConv.id)
          )
          return [...updated, ...newConvs].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
        }
        // Full update on initial load
        return conversationsWithDetails as ConversationWithParticipants[]
      })
    } catch (error: any) {
      console.error('Error fetching conversations:', error)
      if (!silent) {
        setErrorMessage('خطأ في تحميل المحادثات')
      }
    } finally {
      if (showLoading && !silent) {
        setLoading(false)
      }
    }
  }

  const fetchConversationById = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          creator:users!conversations_created_by_fkey(*),
          worker:users!conversations_worker_id_fkey(*)
        `)
        .eq('id', id)
        .single()

      if (error) throw error

      const conv = data as any
      const conversation: ConversationWithParticipants = {
        ...conv,
        last_message: undefined,
        unread_count: 0,
      }

      setSelectedConversation(conversation)
      fetchMessages(id)
    } catch (error: any) {
      console.error('Error fetching conversation:', error)
    }
  }

  const fetchMessages = async (convId: string, showLoading = true, page = 1, append = false) => {
    try {
      if (showLoading) {
        setLoadingMessages(true)
      }
      
      // Get total count to check if there are more messages
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', convId)
      
      const totalMessages = count || 0
      
      if (append) {
        // When appending (loading older messages), get messages before the oldest current message
        const oldestMessage = messages.length > 0 ? messages[0] : null
        if (oldestMessage) {
          const { data, error } = await supabase
            .from('messages')
            .select(`
              *,
              sender:users!messages_sender_id_fkey(id, name, email, role, status, created_at, updated_at)
            `)
            .eq('conversation_id', convId)
            .lt('created_at', oldestMessage.created_at)
            .order('created_at', { ascending: true })
            .limit(MESSAGES_PER_PAGE)
          
          if (error) throw error
          
          const messagesData = ((data as MessageWithSender[]) || []).map(msg => ({
            ...msg,
            sender: msg.sender ? {
              ...msg.sender,
              name: msg.sender.name || msg.sender.email || 'مستخدم',
            } : {
              id: msg.sender_id,
              name: 'مستخدم',
              email: '',
              role: 'FieldStaff' as any,
              status: 'Active' as any,
              created_at: '',
              updated_at: '',
            }
          }))
          
          // Prepend older messages
          setMessages(prev => [...messagesData, ...prev])
          setHasMoreMessages(messagesData.length === MESSAGES_PER_PAGE)
          setMessagesPage(page + 1)
          
          if (showLoading) {
            setLoadingMessages(false)
          }
          return
        }
      }
      
      // Initial load: get the most recent messages
      const limit = MESSAGES_PER_PAGE
      const offset = Math.max(0, totalMessages - limit)
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:users!messages_sender_id_fkey(id, name, email, role, status, created_at, updated_at)
        `)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)

      if (error) throw error
      
      const messagesData = ((data as MessageWithSender[]) || []).map(msg => ({
        ...msg,
        sender: msg.sender ? {
          ...msg.sender,
          name: msg.sender.name || msg.sender.email || 'مستخدم',
        } : {
          id: msg.sender_id,
          name: 'مستخدم',
          email: '',
          role: 'FieldStaff' as any,
          status: 'Active' as any,
          created_at: '',
          updated_at: '',
        }
      }))
      
      // For initial load, set messages directly
      setMessages(messagesData)
      
      // Check if there are more messages to load (older messages)
      setHasMoreMessages(offset > 0)
      setMessagesPage(1)
      
      // Update ref with latest message state
      if (messagesData.length > 0) {
        lastMessageRef.current = {
          id: messagesData[messagesData.length - 1].id,
          count: messagesData.length
        }
      } else {
        lastMessageRef.current = { id: null, count: 0 }
      }

      // Scroll to bottom after messages are loaded (only if not appending)
      if (!append) {
        setTimeout(() => {
          scrollToBottom(true, true)
        }, 50)
      }

      // Mark notifications as read
      if (user) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .eq('reference_id', convId)
          .eq('type', 'new_message')
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error)
    } finally {
      if (showLoading) {
        setLoadingMessages(false)
      }
    }
  }

  const loadMoreMessages = async () => {
    if (!selectedConversation || !hasMoreMessages || loadingMessages) return
    await fetchMessages(selectedConversation.id, false, messagesPage + 1, true)
  }

  // Set up real-time subscription for messages (NO POLLING - only real-time)
  useEffect(() => {
    if (!selectedConversation || !user) return

    // Initialize ref with current state
    lastMessageRef.current = {
      id: messages.length > 0 ? messages[messages.length - 1].id : null,
      count: messages.length
    }

    // NO POLLING - rely only on real-time subscriptions

    // Also try real-time subscription (if enabled)
    const channelName = `messages-${selectedConversation.id}`
    const messagesChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        async (payload) => {
          try {
            const { data, error } = await supabase
              .from('messages')
              .select(`
                *,
                sender:users!messages_sender_id_fkey(id, name, email, role, status, created_at, updated_at)
              `)
              .eq('id', payload.new.id)
              .single()

            if (!error && data) {
              // Normalize sender data
              const messageWithSender: MessageWithSender = {
                ...data,
                sender: data.sender ? {
                  ...data.sender,
                  name: data.sender.name || data.sender.email || 'مستخدم',
                } : {
                  id: data.sender_id,
                  name: 'مستخدم',
                  email: '',
                  role: 'FieldStaff' as any,
                  status: 'Active' as any,
                  created_at: '',
                  updated_at: '',
                }
              }
              // Mark as unread if it's not from current user (will be highlighted)
              if (messageWithSender.sender_id !== user?.id) {
                // Don't mark as read automatically - user needs to click it
              }
              // Always update messages via real-time (no typing check needed since no polling)
              setMessages(prev => {
                const exists = prev.some(m => m.id === messageWithSender.id)
                if (exists) return prev
                const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-'))
                const newMessages = [...withoutOptimistic, messageWithSender]
                // Update ref
                lastMessageRef.current = {
                  id: data.id,
                  count: newMessages.length
                }
                // Scroll to bottom when new message arrives via real-time (only if at bottom)
                if (shouldAutoScrollRef.current) {
                  setTimeout(() => scrollToBottom(false), 50)
                }
                return newMessages
              })
              if (selectedConversation) {
                // Update conversation in list with new message
                updateConversationInList(selectedConversation.id, {
                  last_message: messageWithSender,
                  updated_at: messageWithSender.created_at,
                })
                
                // Also update conversations list to reflect new message
                setConversations(prev => prev.map(conv => {
                  if (conv.id === selectedConversation.id) {
                    return {
                      ...conv,
                      last_message: messageWithSender,
                      updated_at: messageWithSender.created_at,
                    }
                  }
                  return conv
                }).sort((a, b) => 
                  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                ))
              }
            }
          } catch (err) {
            console.error('Error processing real-time message:', err)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
    }
  }, [selectedConversation?.id, user?.id, updateConversationInList])

  const fetchWorkers = async () => {
    try {
      const { data, error } = await supabase
        .from('worker_profiles')
        .select(`
          *,
          user:users!worker_profiles_user_id_fkey(*)
        `)

      if (error) throw error

      const workersList = (data || []).map((wp: any) => ({
        ...wp.user,
        worker_profile: wp,
      }))

      setWorkers(workersList)
    } catch (error: any) {
      console.error('Error fetching workers:', error)
    }
  }

  const selectConversation = async (conversation: ConversationWithParticipants) => {
    setSelectedConversation(conversation)
    setMessageText('')
    messageTextRef.current = ''
    setMessages([]) // Clear messages first
    shouldAutoScrollRef.current = true // Reset auto-scroll when selecting new conversation
    await fetchMessages(conversation.id)
    // Scroll to bottom after messages are loaded (force scroll on new conversation)
    setTimeout(() => {
      scrollToBottom(true, true)
    }, 100)
    navigate(`/messages?conversation=${conversation.id}`, { replace: true })
  }

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedConversation || !user) return

    const messageToSend = messageText.trim()
    setSending(true)
    setErrorMessage(null)
    setMessageText('') // Clear input immediately for better UX
    messageTextRef.current = '' // Clear ref too

    try {
      const cleanBody = sanitizeText(messageToSend)

      // Create optimistic message immediately (temporary ID)
      const tempId = `temp-${Date.now()}`
      const optimisticMessage: MessageWithSender = {
        id: tempId,
        conversation_id: selectedConversation.id,
        sender_id: user.id,
        body: cleanBody,
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          name: profile?.name || user.email || 'أنت',
          email: profile?.email || user.email || '',
          role: (profile?.role || 'Owner') as any,
          status: (profile?.status || 'Active') as any,
          created_at: profile?.created_at || '',
          updated_at: profile?.updated_at || '',
        },
      }

      // Add optimistic message immediately (shows instantly)
      setMessages(prev => {
        // Make sure we don't add duplicates
        if (prev.some(m => m.id === tempId)) {
          return prev
        }
        return [...prev, optimisticMessage]
      })

      const { data, error } = await supabase
        .from('messages')
        .insert([{
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          body: cleanBody,
        }])
        .select(`
          *,
          sender:users!messages_sender_id_fkey(id, name, email, role, status)
        `)
        .single()

      if (error) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
        throw error
      }

      // Replace optimistic message with real one
      if (data) {
        setMessages(prev => {
          // Remove optimistic message
          const withoutOptimistic = prev.filter(m => m.id !== tempId && !m.id.startsWith('temp-'))
          // Add real message (avoid duplicates)
          if (withoutOptimistic.some(m => m.id === data.id)) {
            return withoutOptimistic
          }
          const newMessages = [...withoutOptimistic, data as MessageWithSender]
          // Update ref
          lastMessageRef.current = {
            id: data.id,
            count: newMessages.length
          }
          // Scroll to bottom after sending message
          setTimeout(() => scrollToBottom(false), 50)
          return newMessages
        })
        
        // Update conversation in list directly (smooth, no refresh)
        updateConversationInList(selectedConversation.id, {
          last_message: data,
          updated_at: data.created_at,
        })
      } else {
        // Fallback: fetch messages if data not returned
        setTimeout(() => {
          fetchMessages(selectedConversation.id, false)
        }, 300)
      }
    } catch (error: any) {
      console.error('Error sending message:', error)
      setErrorMessage('خطأ في إرسال الرسالة')
      // Restore message text on error
      setMessageText(messageToSend)
    } finally {
      setSending(false)
    }
  }

  const createConversation = async () => {
    if (!newConversationForm.worker_id || !newConversationForm.subject.trim() || !user) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
      return
    }

    setSending(true)
    setErrorMessage(null)

    try {
      const cleanSubject = sanitizeText(newConversationForm.subject.trim())

      const { data, error } = await supabase
        .from('conversations')
        .insert([{
          created_by: user.id,
          worker_id: newConversationForm.worker_id,
          subject: cleanSubject,
          status: 'open',
        }])
        .select()
        .single()

      if (error) throw error

      showNotification('تم إنشاء المحادثة بنجاح', 'success')
      setNewConversationOpen(false)
      setNewConversationForm({ worker_id: '', subject: '' })
      await fetchConversations(false, true) // Silent update for new conversation
      
      // Select the new conversation
      if (data) {
        const { data: convData } = await supabase
          .from('conversations')
          .select(`
            *,
            creator:users!conversations_created_by_fkey(*),
            worker:users!conversations_worker_id_fkey(*)
          `)
          .eq('id', data.id)
          .single()

        if (convData) {
          const newConv: ConversationWithParticipants = {
            ...convData as any,
            last_message: undefined,
            unread_count: 0,
          }
          selectConversation(newConv)
        }
      }
    } catch (error: any) {
      console.error('Error creating conversation:', error)
      setErrorMessage('خطأ في إنشاء المحادثة')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (newConversationOpen) {
      fetchWorkers()
    }
  }, [newConversationOpen])

  // Filter conversations by search query
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const name = conv.created_by === user?.id
      ? conv.worker?.name || ''
      : conv.creator?.name || ''
    return name.toLowerCase().includes(query) || 
           conv.subject.toLowerCase().includes(query) ||
           conv.last_message?.body.toLowerCase().includes(query)
  })

  // Format time for messages (show time if today, date if older)
  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="relative flex h-[calc(100vh-4rem)] bg-muted/30 md:bg-background">
      {/* Burger menu button - Mobile only */}
      <div className="fixed top-2 left-2 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-background shrink-0 h-9 w-9"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar - Mobile overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className={`
            fixed inset-y-0 left-0 z-40 md:hidden
            transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

    <div className="flex h-[calc(100vh-4rem)] bg-muted/30 md:bg-background w-full">
      {/* Conversations List - Mobile: overlay, Desktop: sidebar */}
      <div className={`
        ${showConversations || selectedConversation === null ? 'flex' : 'hidden'} 
        md:flex
        flex-col
        w-full md:w-80 lg:w-96
        bg-background
        border-r border-border
        ${showConversations ? 'fixed inset-0 z-50 md:relative md:z-auto' : ''}
      `}>
        {/* Header */}
        <div className="p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">المحادثات</h2>
            <div className="flex items-center gap-2">
              {profile?.role === 'Owner' && (
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={() => setNewConversationOpen(true)}
                  className="h-9 w-9"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              )}
              <Button 
                size="icon" 
                variant="ghost"
                onClick={() => navigate('/')}
                className="h-9 w-9 md:hidden"
                title="العودة للرئيسية"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="بحث في المحادثات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 bg-muted/50"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium mb-1">{searchQuery ? 'لا توجد نتائج' : 'لا توجد محادثات'}</p>
              {!searchQuery && profile?.role !== 'Owner' && (
                <p className="text-sm opacity-70">سيتم عرض المحادثات هنا عند وصولها</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredConversations.map((conv) => {
                const otherUser = conv.created_by === user?.id
                  ? conv.worker
                  : conv.creator
                const isSelected = selectedConversation?.id === conv.id
                const displayName = otherUser?.name || otherUser?.email || 'مستخدم'
                
                return (
                  <div
                    key={conv.id}
                    className={`
                      p-4 cursor-pointer transition-colors
                      ${isSelected 
                        ? 'bg-primary/10 border-r-2 border-r-primary' 
                        : 'hover:bg-muted/50'
                      }
                    `}
                    onClick={() => {
                      selectConversation(conv)
                      setShowConversations(false) // Close on mobile after selection
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm truncate">
                            {displayName}
                          </p>
                          {conv.last_message && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap mr-2">
                              {formatMessageTime(conv.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-muted-foreground truncate flex-1">
                            {conv.last_message?.body || conv.subject}
                          </p>
                          {conv.unread_count && conv.unread_count > 0 && (
                            <Badge 
                              variant="destructive" 
                              className="h-5 min-w-[20px] flex items-center justify-center text-xs px-1.5 rounded-full shrink-0"
                            >
                              {conv.unread_count > 9 ? '9+' : conv.unread_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Messages View - Only show if conversation is selected, or show empty state for owners */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col bg-background md:bg-muted/30">
          {/* Chat Header */}
          <div className="bg-background border-b border-border p-3 md:p-4 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowConversations(true)}
                className="md:hidden h-9 w-9 shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              
              {/* Avatar */}
              {(() => {
                const otherUser = selectedConversation.created_by === user?.id
                  ? selectedConversation.worker
                  : selectedConversation.creator
                const displayName = otherUser?.name || otherUser?.email || '?'
                return (
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )
              })()}
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base truncate">
                  {(() => {
                    const otherUser = selectedConversation.created_by === user?.id
                      ? selectedConversation.worker
                      : selectedConversation.creator
                    return otherUser?.name || otherUser?.email || 'مستخدم'
                  })()}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedConversation.subject}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Badge 
                variant={selectedConversation.status === 'open' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {selectedConversation.status === 'open' ? 'مفتوحة' : 'مغلقة'}
              </Badge>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Messages Container */}
          <div 
            className="flex-1 overflow-y-auto bg-gradient-to-b from-background to-muted/20"
            id="messages-container"
            onScroll={(e) => {
              const container = e.currentTarget
              const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
              shouldAutoScrollRef.current = isNearBottom
            }}
          >
            <div className="max-w-4xl mx-auto p-4 space-y-3">
              {loadingMessages ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  جاري التحميل...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground">لا توجد رسائل بعد</p>
                  <p className="text-sm text-muted-foreground mt-2">ابدأ المحادثة بإرسال رسالة</p>
                </div>
              ) : (
                <>
                  {/* Load More Button */}
                  {hasMoreMessages && (
                    <div className="w-full flex justify-center py-4">
                      <Button
                        variant="outline"
                        onClick={loadMoreMessages}
                        disabled={loadingMessages}
                        className="text-sm"
                      >
                        {loadingMessages ? 'جاري التحميل...' : 'تحميل المزيد'}
                      </Button>
                    </div>
                  )}
                  
                  {messages.map((msg, index) => {
                    const isOwn = msg.sender_id === user?.id
                    const prevMessage = index > 0 ? messages[index - 1] : null
                    const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== msg.sender_id)
                    const showTime = !prevMessage || 
                      new Date(msg.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000 // 5 minutes
                    const isUnread = !isOwn && !readMessages.has(msg.id)
                    
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                        onClick={() => {
                          // Mark message as read when clicked
                          if (!isOwn && !readMessages.has(msg.id)) {
                            setReadMessages(prev => new Set([...prev, msg.id]))
                          }
                        }}
                      >
                        {/* Avatar for received messages */}
                        {!isOwn && (
                          <div className={`flex-shrink-0 ${showAvatar ? 'h-8 w-8' : 'h-8 w-8 opacity-0'}`}>
                            {showAvatar && (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                                {(msg.sender?.name || msg.sender?.email || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%] md:max-w-[60%]`}>
                          {/* Time separator */}
                          {showTime && (
                            <div className="w-full text-center my-2">
                              <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-full">
                                {formatMessageTime(msg.created_at)}
                              </span>
                            </div>
                          )}
                          
                          {/* Message bubble */}
                          <div
                            className={`
                              rounded-2xl px-4 py-2.5 shadow-sm transition-all cursor-pointer
                              ${isOwn
                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                : isUnread
                                ? 'bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-700 rounded-tl-sm ring-2 ring-blue-200 dark:ring-blue-800'
                                : 'bg-background border border-border rounded-tl-sm'
                              }
                              ${!showTime && index > 0 ? 'mt-1' : ''}
                              ${isUnread ? 'hover:bg-blue-100 dark:hover:bg-blue-950/50' : ''}
                            `}
                          >
                            {!isOwn && (
                              <p className="text-xs font-semibold mb-1 opacity-80">
                                {msg.sender?.name || msg.sender?.email || 'مستخدم'}
                              </p>
                            )}
                            <p className={`text-sm whitespace-pre-wrap break-words ${isOwn ? 'text-primary-foreground' : 'text-foreground'}`}>
                              {msg.body}
                            </p>
                            <p className={`text-[10px] mt-1.5 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                              {new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Spacer for sent messages */}
                        {isOwn && <div className="w-8 flex-shrink-0"></div>}
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="bg-background border-t border-border p-3 md:p-4">
            {errorMessage && (
              <div className="text-sm text-destructive mb-2 px-1">{errorMessage}</div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Input
                  value={messageText}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setMessageText(newValue)
                    messageTextRef.current = newValue
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="اكتب رسالتك..."
                  disabled={sending || selectedConversation.status === 'closed'}
                  className="pr-12 min-h-[44px] md:min-h-0 rounded-full bg-muted/50 border-border focus:bg-background"
                />
              </div>
              <Button
                onClick={sendMessage}
                disabled={sending || !messageText.trim() || selectedConversation.status === 'closed'}
                size="icon"
                className="h-11 w-11 rounded-full shrink-0"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Only show empty state for owners, non-owners just see conversation list
        profile?.role === 'Owner' ? (
          <div className="flex-1 flex items-center justify-center bg-background md:bg-muted/30 p-4 md:p-8">
            <div className="text-center max-w-md w-full">
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-10 w-10 text-primary" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                    <Plus className="h-5 w-5 text-primary-foreground" />
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2 text-foreground">ابدأ محادثة جديدة</h3>
              <p className="text-sm text-muted-foreground mb-6">
                اختر محادثة من القائمة أو أنشئ محادثة جديدة للتواصل مع العمال
              </p>
              <Button 
                onClick={() => setNewConversationOpen(true)}
                className="w-full md:w-auto px-6 py-6 md:py-2 h-auto text-base md:text-sm"
                size="lg"
              >
                <Plus className="h-5 w-5 ml-2" />
                إنشاء محادثة جديدة
              </Button>
            </div>
          </div>
        ) : null
      )}

      {/* New Conversation Dialog */}
      <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>محادثة جديدة</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="worker_id">العامل *</Label>
              <select
                id="worker_id"
                value={newConversationForm.worker_id}
                onChange={(e) => setNewConversationForm({ ...newConversationForm, worker_id: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">اختر العامل</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.worker_profile?.worker_type || 'عامل'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="subject">الموضوع *</Label>
              <Input
                id="subject"
                value={newConversationForm.subject}
                onChange={(e) => setNewConversationForm({ ...newConversationForm, subject: e.target.value })}
                placeholder="موضوع المحادثة..."
              />
            </div>

            {errorMessage && (
              <div className="text-sm text-destructive">{errorMessage}</div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewConversationOpen(false)
              setNewConversationForm({ worker_id: '', subject: '' })
              setErrorMessage(null)
            }}>
              إلغاء
            </Button>
            <Button onClick={createConversation} disabled={sending}>
              {sending ? 'جاري الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

