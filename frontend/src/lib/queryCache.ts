/**
 * Simple in-memory cache for API queries
 * Reduces redundant database calls and improves performance
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL = 30 * 1000 // 30 seconds default TTL

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data as T
  }

  /**
   * Set cached data with optional TTL
   */
  set<T>(key: string, data: T, ttlMs: number = this.defaultTTL): void {
    const now = Date.now()
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttlMs,
    })
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Invalidate all entries matching a prefix
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}

// Singleton instance
export const queryCache = new QueryCache()

/**
 * Helper function to fetch with cache
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttlMs?: number; forceRefresh?: boolean } = {}
): Promise<T> {
  const { ttlMs = 30000, forceRefresh = false } = options

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = queryCache.get<T>(key)
    if (cached !== null) {
      return cached
    }
  }

  // Fetch fresh data
  const data = await fetcher()
  
  // Cache the result
  queryCache.set(key, data, ttlMs)
  
  return data
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttle function for frequent updates
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

