import { getIdToken } from '@/lib/firebase/auth';
import {
  SSEEvent,
  SSEMessage,
  SSEMetadata,
  VEPProgress,
  EventType
} from '@/lib/types';

/**
 * SSE connection state
 */
export enum SSEState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  CLOSED = 'closed'
}

/**
 * SSE client configuration
 */
interface SSEConfig {
  baseURL: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  onStateChange?: (state: SSEState) => void;
  onMessage?: (message: SSEMessage) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: VEPProgress) => void;
}

/**
 * Server-Sent Events client for real-time streaming
 */
export class SSEClient {
  private config: SSEConfig;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private buffer = '';
  private state: SSEState = SSEState.DISCONNECTED;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private messageQueue: SSEMessage[] = [];
  private lastEventId: string | null = null;

  constructor(config: Partial<SSEConfig> = {}) {
    this.config = {
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
      reconnectDelay: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      ...config
    };
  }

  /**
   * Update connection state
   */
  private setState(state: SSEState): void {
    this.state = state;
    this.config.onStateChange?.(state);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state === SSEState.CONNECTED) {
        // Send heartbeat ping if needed
        console.log('SSE heartbeat');
      }
    }, this.config.heartbeatInterval!);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Parse SSE event from text
   */
  private parseSSEEvent(text: string): SSEMessage | null {
    try {
      // Handle different event formats
      if (text.startsWith('data: ')) {
        const jsonStr = text.slice(6).trim();

        // Skip empty data or heartbeat
        if (!jsonStr || jsonStr === ':' || jsonStr === 'ping') {
          return null;
        }

        const data = JSON.parse(jsonStr);

        // Parse enhanced event format from backend
        if (data.metadata && data.event) {
          const event: SSEEvent = JSON.parse(data.event);
          const metadata: SSEMetadata = data.metadata;

          return {
            id: event.id || crypto.randomUUID(),
            type: this.determineMessageType(event, metadata),
            content: this.extractContent(event),
            metadata,
            event,
            timestamp: metadata.timestamp || Date.now()
          };
        }

        // Handle legacy format
        return {
          id: data.id || crypto.randomUUID(),
          type: 'general',
          content: data.content || '',
          metadata: {
            session_id: data.session_id,
            user_id: data.user_id,
            firebase_uid: data.firebase_uid,
            timestamp: Date.now(),
            event_type: 'general'
          },
          event: data,
          timestamp: Date.now()
        };
      }

      // Handle event ID
      if (text.startsWith('id: ')) {
        this.lastEventId = text.slice(4).trim();
        return null;
      }

      // Handle event type
      if (text.startsWith('event: ')) {
        // Store event type for next data event
        return null;
      }

      return null;
    } catch (error) {
      console.error('Failed to parse SSE event:', error, 'Text:', text);
      return null;
    }
  }

  /**
   * Determine message type from event
   */
  private determineMessageType(event: SSEEvent, metadata: SSEMetadata): EventType {
    // Use metadata event_type if available
    if (metadata.event_type) {
      return metadata.event_type as EventType;
    }

    // Fallback to analyzing event structure
    if (event.content?.parts) {
      for (const part of event.content.parts) {
        if (part.function_call) return 'function_call';
        if (part.function_response) return 'function_response';
        if (part.text) return 'streaming_text';
      }
    }

    if (event.is_final_response) return 'final_response';
    if (event.partial) return 'streaming_text';

    return 'general';
  }

  /**
   * Extract content from event
   */
  private extractContent(event: SSEEvent): string {
    if (event.content?.parts) {
      for (const part of event.content.parts) {
        if (part.text) return part.text;
        if (part.function_call) {
          return `Calling function: ${part.function_call.name}`;
        }
        if (part.function_response) {
          return `Function response: ${part.function_response.name}`;
        }
      }
    }

    return '';
  }

  /**
   * Process SSE stream
   */
  private async processStream(): Promise<void> {
    if (!this.reader) return;

    try {
      while (true) {
        const { done, value } = await this.reader.read();

        if (done) {
          console.log('SSE stream completed');
          break;
        }

        // Decode chunk
        const chunk = this.decoder.decode(value, { stream: true });
        this.buffer += chunk;

        // Process complete events
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();

          // Skip empty lines
          if (!trimmedLine) continue;

          // Parse SSE event
          const message = this.parseSSEEvent(trimmedLine);
          if (message) {
            this.handleMessage(message);
          }
        }
      }
    } catch (error) {
      console.error('Stream processing error:', error);
      this.handleError(error as Error);
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: SSEMessage): void {
    // Add to queue
    this.messageQueue.push(message);

    // Limit queue size
    if (this.messageQueue.length > 1000) {
      this.messageQueue.shift();
    }

    // Handle progress updates
    if (message.metadata.progress) {
      this.config.onProgress?.(message.metadata.progress);
    }

    // Notify listener
    this.config.onMessage?.(message);
  }

  /**
   * Handle connection error
   */
  private handleError(error: Error): void {
    console.error('SSE error:', error);
    this.setState(SSEState.ERROR);
    this.config.onError?.(error);

    // Attempt reconnect if not aborted
    if (!this.abortController?.signal.aborted &&
        this.reconnectAttempts < this.config.maxReconnectAttempts!) {
      this.reconnect();
    } else {
      this.close();
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay! * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (this.state !== SSEState.CLOSED) {
      // Reconnect with last event ID for resumption
      // Implementation would need to pass lastEventId to connect
    }
  }

  /**
   * Connect to SSE stream
   */
  async connect(
    inputText: string,
    sessionId?: string
  ): Promise<void> {
    try {
      this.setState(SSEState.CONNECTING);

      // Get auth token
      const token = await getIdToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Create abort controller
      this.abortController = new AbortController();

      // Make request
      const response = await fetch(`${this.config.baseURL}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          input_text: inputText,
          session_id: sessionId,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.statusText}`);
      }

      // Check for SSE content type
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/event-stream')) {
        console.warn('Response is not SSE, got:', contentType);
      }

      // Get reader
      this.reader = response.body?.getReader() || null;
      if (!this.reader) {
        throw new Error('No response body');
      }

      this.setState(SSEState.CONNECTED);
      this.reconnectAttempts = 0;
      this.startHeartbeat();

      // Process stream
      await this.processStream();

    } catch (error) {
      this.handleError(error as Error);
    } finally {
      this.setState(SSEState.DISCONNECTED);
      this.stopHeartbeat();
    }
  }

  /**
   * Close SSE connection
   */
  close(): void {
    this.setState(SSEState.CLOSED);

    // Cancel reader
    if (this.reader) {
      this.reader.cancel().catch(console.error);
      this.reader = null;
    }

    // Abort connection
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Stop heartbeat
    this.stopHeartbeat();

    // Clear buffer
    this.buffer = '';

    console.log('SSE connection closed');
  }

  /**
   * Get message history
   */
  getMessageHistory(): SSEMessage[] {
    return [...this.messageQueue];
  }

  /**
   * Clear message history
   */
  clearMessageHistory(): void {
    this.messageQueue = [];
  }

  /**
   * Get current connection state
   */
  getState(): SSEState {
    return this.state;
  }
}

// Create singleton instance for easy import
export const sseClient = new SSEClient();