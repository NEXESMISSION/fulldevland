import { useState, useCallback, useRef } from 'react'

interface MutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: Error, variables: TVariables) => void
  onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables) => void
}

interface MutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | undefined>
  mutateAsync: (variables: TVariables) => Promise<TData>
  isLoading: boolean
  isError: boolean
  error: Error | null
  data: TData | null
  reset: () => void
}

/**
 * Hook for handling mutations with loading states
 * Provides better UX with immediate feedback
 */
export function useMutation<TData, TVariables = void>(
  options: MutationOptions<TData, TVariables>
): MutationResult<TData, TVariables> {
  const [isLoading, setIsLoading] = useState(false)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<TData | null>(null)
  
  const optionsRef = useRef(options)
  optionsRef.current = options

  const reset = useCallback(() => {
    setIsLoading(false)
    setIsError(false)
    setError(null)
    setData(null)
  }, [])

  const mutateAsync = useCallback(async (variables: TVariables): Promise<TData> => {
    setIsLoading(true)
    setIsError(false)
    setError(null)

    try {
      const result = await optionsRef.current.mutationFn(variables)
      setData(result)
      optionsRef.current.onSuccess?.(result, variables)
      optionsRef.current.onSettled?.(result, null, variables)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setIsError(true)
      setError(error)
      optionsRef.current.onError?.(error, variables)
      optionsRef.current.onSettled?.(undefined, error, variables)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const mutate = useCallback(async (variables: TVariables): Promise<TData | undefined> => {
    try {
      return await mutateAsync(variables)
    } catch {
      return undefined
    }
  }, [mutateAsync])

  return {
    mutate,
    mutateAsync,
    isLoading,
    isError,
    error,
    data,
    reset,
  }
}

/**
 * Hook for optimistic updates
 * Updates UI immediately, then syncs with server
 */
export function useOptimisticUpdate<TData, TVariables>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>
  optimisticUpdate: (variables: TVariables) => void
  rollback: () => void
  onSuccess?: (data: TData) => void
  onError?: (error: Error) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(async (variables: TVariables) => {
    setIsLoading(true)
    setError(null)

    // Apply optimistic update immediately
    options.optimisticUpdate(variables)

    try {
      const result = await options.mutationFn(variables)
      options.onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      // Rollback on error
      options.rollback()
      options.onError?.(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [options])

  return { execute, isLoading, error }
}

/**
 * Batch multiple operations together
 * Useful for bulk updates
 */
export async function batchOperations<T>(
  operations: (() => Promise<T>)[],
  options: { concurrency?: number; stopOnError?: boolean } = {}
): Promise<{ results: T[]; errors: Error[] }> {
  const { concurrency = 5, stopOnError = false } = options
  const results: T[] = []
  const errors: Error[] = []

  // Process in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(op => op()))

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        errors.push(result.reason)
        if (stopOnError) {
          return { results, errors }
        }
      }
    }
  }

  return { results, errors }
}

