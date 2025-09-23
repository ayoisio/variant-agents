'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import {
  Session,
  SessionDetailsResponse,
  SessionListResponse,
  SessionEvent
} from '@/lib/types';

interface UseSessionOptions {
  sessionId?: string;
  autoLoad?: boolean;
  pollingInterval?: number;
}

interface UseSessionReturn {
  // Current session
  session: Session | null;
  sessionDetails: SessionDetailsResponse | null;
  events: SessionEvent[];

  // Session list
  sessions: Session[];
  totalSessions: number;

  // Loading states
  loading: boolean;
  updating: boolean;
  error: Error | null;

  // CRUD operations
  createSession: (inputText: string) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  updateSession: (sessionId: string, updates: Record<string, any>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;

  // List operations
  listSessions: (limit?: number, offset?: number) => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshSessions: () => Promise<void>;

  // Cache management
  clearCache: () => void;
  getCachedSession: (sessionId: string) => Session | undefined;
}

// Session cache
const sessionCache = new Map<string, Session>();
const sessionDetailsCache = new Map<string, SessionDetailsResponse>();

export function useSession(options: UseSessionOptions = {}): UseSessionReturn {
  const router = useRouter();
  const { sessionId, autoLoad = true, pollingInterval } = options;

  // State
  const [session, setSession] = useState<Session | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetailsResponse | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Auto-load session
  useEffect(() => {
    if (sessionId && autoLoad) {
      loadSession(sessionId);
    }
  }, [sessionId, autoLoad]);

  // Set up polling
  useEffect(() => {
    if (pollingInterval && session && session.status !== 'completed' && session.status !== 'error') {
      pollingTimerRef.current = setInterval(() => {
        refreshSession();
      }, pollingInterval);

      return () => {
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
        }
      };
    }
  }, [pollingInterval, session?.status]);

  // Create new session
  const createSession = useCallback(async (inputText: string): Promise<string> => {
    setError(null);
    setUpdating(true);

    try {
      // This would typically be handled by the SSE connection
      // The session ID comes back in the SSE response
      // For now, we'll just return a placeholder
      const response = await apiClient.runAgent({ input_text: inputText });

      // Extract session ID from response headers
      const sessionId = response.headers.get('X-Session-ID');
      if (!sessionId) {
        throw new Error('No session ID returned');
      }

      return sessionId;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setUpdating(false);
    }
  }, []);

  // Load session details
  const loadSession = useCallback(async (sessionId: string) => {
    // Check cache first
    const cached = sessionDetailsCache.get(sessionId);
    if (cached) {
      setSession(cached.metadata);
      setSessionDetails(cached);
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await apiClient.getSession(sessionId);

      // Update cache
      sessionCache.set(sessionId, response.metadata);
      sessionDetailsCache.set(sessionId, response);

      setSession(response.metadata);
      setSessionDetails(response);

      // Load events
      const eventsResponse = await apiClient.getSessionEvents(sessionId);
      setEvents(eventsResponse.events);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Update session (optimistic update)
  const updateSession = useCallback(async (sessionId: string, updates: Record<string, any>) => {
    setError(null);
    setUpdating(true);

    // Optimistic update
    const optimisticSession = session ? { ...session, ...updates } : null;
    if (optimisticSession) {
      setSession(optimisticSession);
      sessionCache.set(sessionId, optimisticSession);
    }

    try {
      await apiClient.updateSessionMetadata(sessionId, updates);

      // Refresh to get server state
      await refreshSession();
    } catch (err) {
      // Revert optimistic update
      if (session) {
        setSession(session);
        sessionCache.set(sessionId, session);
      }

      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setUpdating(false);
    }
  }, [session]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    setError(null);
    setUpdating(true);

    try {
      await apiClient.deleteSession(sessionId);

      // Remove from cache
      sessionCache.delete(sessionId);
      sessionDetailsCache.delete(sessionId);

      // Remove from list
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));

      // Clear current session if it was deleted
      if (session?.session_id === sessionId) {
        setSession(null);
        setSessionDetails(null);
        setEvents([]);
      }

      // Navigate back to dashboard
      router.push('/dashboard');
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setUpdating(false);
    }
  }, [session, router]);

  // Resume session
  const resumeSession = useCallback(async (sessionId: string) => {
    setError(null);
    setUpdating(true);

    try {
      const response = await apiClient.resumeSession(sessionId);

      // Update cache
      sessionCache.set(sessionId, response.metadata);
      sessionDetailsCache.set(sessionId, response);

      setSession(response.metadata);
      setSessionDetails(response);

      // Navigate to session
      router.push(`/analysis/${sessionId}`);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setUpdating(false);
    }
  }, [router]);

  // List sessions
  const listSessions = useCallback(async (limit = 20, offset = 0) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.listSessions(limit, offset);

      // Update cache
      response.sessions.forEach(s => {
        sessionCache.set(s.session_id, s);
      });

      setSessions(response.sessions);
      setTotalSessions(response.count);
    } catch (err) {
      const error = err as Error;
      setError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh current session
  const refreshSession = useCallback(async () => {
    if (!session?.session_id) return;

    try {
      const response = await apiClient.getSession(session.session_id);

      // Update cache
      sessionCache.set(session.session_id, response.metadata);
      sessionDetailsCache.set(session.session_id, response);

      setSession(response.metadata);
      setSessionDetails(response);
    } catch (err) {
      console.error('Failed to refresh session:', err);
    }
  }, [session?.session_id]);

  // Refresh sessions list
  const refreshSessions = useCallback(async () => {
    await listSessions();
  }, [listSessions]);

  // Clear cache
  const clearCache = useCallback(() => {
    sessionCache.clear();
    sessionDetailsCache.clear();
  }, []);

  // Get cached session
  const getCachedSession = useCallback((sessionId: string): Session | undefined => {
    return sessionCache.get(sessionId);
  }, []);

  return {
    session,
    sessionDetails,
    events,
    sessions,
    totalSessions,
    loading,
    updating,
    error,
    createSession,
    loadSession,
    updateSession,
    deleteSession,
    resumeSession,
    listSessions,
    refreshSession,
    refreshSessions,
    clearCache,
    getCachedSession
  };
}