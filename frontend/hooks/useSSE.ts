'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SSEClient, SSEState } from '@/lib/api/sse';
import { SSEMessage, VEPProgress } from '@/lib/types';
import { useAuth } from './useAuth';

interface UseSSEOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  onMessage?: (message: SSEMessage) => void;
  onProgress?: (progress: VEPProgress) => void;
  onStateChange?: (state: SSEState) => void;
  onError?: (error: Error) => void;
}

interface UseSSEReturn {
  state: SSEState;
  messages: SSEMessage[];
  lastMessage: SSEMessage | null;
  error: Error | null;
  progress: VEPProgress | null;

  connect: (inputText: string, sessionId?: string) => Promise<void>;
  disconnect: () => void;
  clearMessages: () => void;
  sendMessage: (message: string) => Promise<void>;
  isConnected: boolean;
  isConnecting: boolean;
  isError: boolean;
}

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const { getAccessToken } = useAuth();
  const [state, setState] = useState<SSEState>(SSEState.DISCONNECTED);
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<SSEMessage | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<VEPProgress | null>(null);

  const clientRef = useRef<SSEClient | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Create client instance
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new SSEClient({
        reconnectDelay: options.reconnectDelay || 3000,
        maxReconnectAttempts: options.reconnectAttempts || 5,
        onMessage: handleMessage,
        onProgress: handleProgress,
        onStateChange: handleStateChange,
        onError: handleError
      });
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((message: SSEMessage) => {
    setMessages(prev => [...prev, message]);
    setLastMessage(message);
    options.onMessage?.(message);
  }, [options.onMessage]);

  // Handle progress updates
  const handleProgress = useCallback((prog: VEPProgress) => {
    setProgress(prog);
    options.onProgress?.(prog);
  }, [options.onProgress]);

  // Handle state changes
  const handleStateChange = useCallback((newState: SSEState) => {
    setState(newState);
    options.onStateChange?.(newState);

    // Clear error on successful connection
    if (newState === SSEState.CONNECTED) {
      setError(null);
      reconnectAttemptsRef.current = 0;
    }

    // Handle disconnection with reconnect
    if (newState === SSEState.DISCONNECTED && options.autoConnect) {
      scheduleReconnect();
    }
  }, [options.onStateChange, options.autoConnect]);

  // Handle errors
  const handleError = useCallback((err: Error) => {
    setError(err);
    setState(SSEState.ERROR);
    options.onError?.(err);

    // Attempt reconnection if configured
    if (options.autoConnect && reconnectAttemptsRef.current < (options.reconnectAttempts || 5)) {
      scheduleReconnect();
    }
  }, [options.onError, options.autoConnect, options.reconnectAttempts]);

  // Schedule reconnection attempt
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    const delay = (options.reconnectDelay || 3000) * Math.pow(2, reconnectAttemptsRef.current);

    reconnectTimerRef.current = setTimeout(async () => {
      reconnectAttemptsRef.current++;

      if (sessionIdRef.current && clientRef.current) {
        try {
          await connect('', sessionIdRef.current);
        } catch (err) {
          console.error('Reconnection failed:', err);
        }
      }
    }, delay);
  }, [options.reconnectDelay]);

  // Connect to SSE stream
  const connect = useCallback(async (inputText: string, sessionId?: string) => {
    if (!clientRef.current) {
      throw new Error('SSE client not initialized');
    }

    if (state === SSEState.CONNECTED || state === SSEState.CONNECTING) {
      console.warn('Already connected or connecting');
      return;
    }

    setState(SSEState.CONNECTING);
    sessionIdRef.current = sessionId;

    try {
      // Get fresh token
      const token = await getAccessToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      await clientRef.current.connect(inputText, sessionId);
    } catch (err) {
      handleError(err as Error);
      throw err;
    }
  }, [state, getAccessToken, handleError]);

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      setState(SSEState.DISCONNECTED);
      sessionIdRef.current = undefined;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
  }, []);

  // Clear message history
  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);

    if (clientRef.current) {
      clientRef.current.clearMessageHistory();
    }
  }, []);

  // Send a message (wrapper for connect with existing session)
  const sendMessage = useCallback(async (message: string) => {
    if (!sessionIdRef.current) {
      throw new Error('No active session');
    }

    if (state !== SSEState.CONNECTED) {
      throw new Error('Not connected to SSE stream');
    }

    // For sending messages in an existing session,
    // we need to make a new request to the backend
    // This is handled by the parent component typically
    throw new Error('Use connect() with the message and session ID');
  }, [state]);

  // Computed states
  const isConnected = state === SSEState.CONNECTED;
  const isConnecting = state === SSEState.CONNECTING;
  const isError = state === SSEState.ERROR;

  return {
    state,
    messages,
    lastMessage,
    error,
    progress,
    connect,
    disconnect,
    clearMessages,
    sendMessage,
    isConnected,
    isConnecting,
    isError
  };
}