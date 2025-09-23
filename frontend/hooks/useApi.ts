'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';

interface UseApiOptions<T> {
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  autoFetch?: boolean;
  cache?: boolean;
  cacheTime?: number; // milliseconds
  retryCount?: number;
  retryDelay?: number; // milliseconds
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseApiReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;

  execute: (overrides?: Partial<UseApiOptions<T>>) => Promise<T>;
  cancel: () => void;
  reset: () => void;
  refetch: () => Promise<T>;

  isIdle: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

// Response cache
const responseCache = new Map<string, { data: any; timestamp: number }>();

export function useApi<T = any>(
  endpoint: string,
  options: UseApiOptions<T> = {}
): UseApiReturn<T> {
  const { getAccessToken } = useAuth();

  const {
    url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
    method = 'GET',
    body,
    headers = {},
    autoFetch = false,
    cache = true,
    cacheTime = 5 * 60 * 1000, // 5 minutes
    retryCount = 3,
    retryDelay = 1000,
    onSuccess,
    onError
  } = options;

  // State
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Auto fetch on mount
  useEffect(() => {
    if (autoFetch && state === 'idle') {
      execute();
    }
  }, [autoFetch]);

  // Generate cache key
  const getCacheKey = useCallback(() => {
    const params = {
      url: `${url}${endpoint}`,
      method,
      body: body ? JSON.stringify(body) : undefined
    };
    return JSON.stringify(params);
  }, [url, endpoint, method, body]);

  // Check cache
  const checkCache = useCallback((): T | null => {
    if (!cache) return null;

    const cacheKey = getCacheKey();
    const cached = responseCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cacheTime) {
        return cached.data as T;
      } else {
        responseCache.delete(cacheKey);
      }
    }

    return null;
  }, [cache, cacheTime, getCacheKey]);

  // Update cache
  const updateCache = useCallback((data: T) => {
    if (!cache) return;

    const cacheKey = getCacheKey();
    responseCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }, [cache, getCacheKey]);

  // Execute request with retries
  const executeWithRetry = useCallback(async (
    attempt: number,
    options: UseApiOptions<T>
  ): Promise<T> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = await getAccessToken();

      const requestHeaders: HeadersInit = {
        'Content-Type': 'application/json',
        ...headers,
        ...options.headers,
      };

      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }

      const requestOptions: RequestInit = {
        method: options.method || method,
        headers: requestHeaders,
        signal: controller.signal,
      };

      if (options.body || body) {
        requestOptions.body = JSON.stringify(options.body || body);
      }

      const response = await fetch(`${url}${endpoint}`, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;

    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw err;
        }

        // Retry logic
        if (attempt < retryCount) {
          return new Promise((resolve, reject) => {
            retryTimeoutRef.current = setTimeout(async () => {
              try {
                const result = await executeWithRetry(attempt + 1, options);
                resolve(result);
              } catch (retryErr) {
                reject(retryErr);
              }
            }, retryDelay * Math.pow(2, attempt)); // Exponential backoff
          });
        }
      }

      throw err;
    }
  }, [url, endpoint, method, body, headers, retryCount, retryDelay, getAccessToken]);

  // Execute request
  const execute = useCallback(async (
    overrides?: Partial<UseApiOptions<T>>
  ): Promise<T> => {
    // Check cache first
    const cached = checkCache();
    if (cached && !overrides) {
      setData(cached);
      setState('success');
      onSuccess?.(cached);
      return cached;
    }

    setLoading(true);
    setState('loading');
    setError(null);

    try {
      const result = await executeWithRetry(0, { ...options, ...overrides });

      if (isMountedRef.current) {
        setData(result);
        setState('success');
        setLoading(false);
        updateCache(result);
        onSuccess?.(result);
      }

      return result;
    } catch (err) {
      const error = err as Error;

      if (isMountedRef.current && error.name !== 'AbortError') {
        setError(error);
        setState('error');
        setLoading(false);
        onError?.(error);
      }

      throw error;
    }
  }, [checkCache, executeWithRetry, options, updateCache, onSuccess, onError]);

  // Cancel request
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setLoading(false);
    setState('idle');
  }, []);

  // Reset state
  const reset = useCallback(() => {
    cancel();
    setData(null);
    setError(null);
    setState('idle');
  }, [cancel]);

  // Refetch (bypass cache)
  const refetch = useCallback(async (): Promise<T> => {
    // Clear cache for this request
    const cacheKey = getCacheKey();
    responseCache.delete(cacheKey);

    return execute();
  }, [getCacheKey, execute]);

  // Computed states
  const isIdle = state === 'idle';
  const isLoading = state === 'loading';
  const isSuccess = state === 'success';
  const isError = state === 'error';

  return {
    data,
    loading,
    error,
    execute,
    cancel,
    reset,
    refetch,
    isIdle,
    isLoading,
    isSuccess,
    isError
  };
}