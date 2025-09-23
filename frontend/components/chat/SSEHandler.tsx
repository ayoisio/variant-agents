'use client';

import { SSEClient, SSEState } from '@/lib/api/sse';
import { SSEMessage, SSEMetadata, VEPProgress } from '@/lib/types';
import { ChartDetector, DetectedVisualization } from '@/lib/visualization/chartDetector';

interface SSEHandlerConfig {
  onMessage: (message: SSEMessage) => void;
  onMetadata?: (metadata: SSEMetadata) => void;
  onProgress?: (progress: VEPProgress) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: SSEState) => void;
  onVisualizationDetected?: (viz: DetectedVisualization) => void;
  debug?: boolean;
}

export class SSEHandler {
  private client: SSEClient;
  private config: SSEHandlerConfig;
  public sessionId?: string;
  private logBuffer: string[] = [];
  
  constructor(config: SSEHandlerConfig) {
    this.config = config;
    
    this.client = new SSEClient({
      onMessage: this.handleMessage.bind(this),
      onError: this.handleError.bind(this),
      onProgress: this.handleProgress.bind(this),
      onStateChange: this.handleStateChange.bind(this)
    });
  }
  
  private log(message: string) {
    if (this.config.debug) {
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      const logEntry = `[${timestamp}] SSE: ${message}`;
      console.log(logEntry);
      this.logBuffer.push(logEntry);
      if (this.logBuffer.length > 100) {
        this.logBuffer.shift();
      }
    }
  }
  
  private handleMessage(message: SSEMessage) {
    this.log(`Message received: type=${message.type}, length=${message.content.length}`);
    
    // Extract session ID from metadata if available
    if (message.metadata.session_id && !this.sessionId) {
      this.sessionId = message.metadata.session_id;
      this.log(`Session ID extracted: ${this.sessionId}`);
    }
    
    // Check for visualization data in the message
    const visualization = ChartDetector.detectInSSEEvent(message);
    if (visualization) {
      this.log(`Visualization detected: type=${visualization.type}, title=${visualization.title}`);
      this.config.onVisualizationDetected?.(visualization);
    }
    
    // Also check the event field directly if it contains different data
    if (message.event) {
      const eventVisualization = ChartDetector.detectInSSEEvent({ event: message.event });
      if (eventVisualization && eventVisualization.id !== visualization?.id) {
        this.log(`Additional visualization from event: type=${eventVisualization.type}`);
        this.config.onVisualizationDetected?.(eventVisualization);
      }
    }
    
    // Pass metadata to handler
    if (message.metadata) {
      this.config.onMetadata?.(message.metadata);
      
      // Check if metadata contains visualization hints
      if (message.metadata.visualization) {
        const metaViz = ChartDetector.detectInSSEEvent({ 
          metadata: { visualization: message.metadata.visualization }
        });
        if (metaViz) {
          this.log(`Visualization from metadata: type=${metaViz.type}`);
          this.config.onVisualizationDetected?.(metaViz);
        }
      }
    }
    
    // Pass message to handler
    this.config.onMessage(message);
    
    // Check for completion
    if (message.type === 'final_response' || 
        (message.event && message.event.turn_complete)) {
      this.log('Message marked as complete');
      this.config.onComplete?.();
    }
  }
  
  private handleError(error: Error) {
    this.log(`Error occurred: ${error.message}`);
    console.error('[SSE Handler Error]', error);
    this.config.onError?.(error);
  }
  
  private handleProgress(progress: VEPProgress) {
    this.log(`Progress update: ${progress.status} - ${progress.estimated_progress}%`);
    this.config.onProgress?.(progress);
  }
  
  private handleStateChange(state: SSEState) {
    // Get the string representation of the enum value
    const stateName = Object.keys(SSEState)[Object.values(SSEState).indexOf(state)] || state;
    this.log(`State changed to: ${stateName}`);
    this.config.onStateChange?.(state);
    
    if (state === SSEState.CONNECTED) {
      this.log('Successfully connected to SSE stream');
    } else if (state === SSEState.DISCONNECTED) {
      this.log('Disconnected from SSE stream');
      this.config.onComplete?.();
    } else if (state === SSEState.ERROR) {
      this.log('SSE connection in error state');
    }
  }
    
  async connect(inputText: string, sessionId?: string) {
    this.log(`Connecting: sessionId=${sessionId || 'new'}, input=${inputText.slice(0, 50)}...`);
    
    try {
      await this.client.connect(inputText, sessionId);
      if (sessionId) {
        this.sessionId = sessionId;
      }
      this.log('Connection established');
    } catch (error) {
      this.log(`Connection failed: ${(error as Error).message}`);
      this.handleError(error as Error);
      throw error;
    }
  }
  
  disconnect() {
    this.log('Disconnecting from SSE stream');
    this.client.close();
  }
  
  getState(): SSEState {
    return this.client.getState();
  }
  
  getMessageHistory(): SSEMessage[] {
    return this.client.getMessageHistory();
  }
  
  clearHistory() {
    this.log('Clearing message history');
    this.client.clearMessageHistory();
  }
  
  getDebugLog(): string[] {
    return [...this.logBuffer];
  }
  
  exportDebugLog(): string {
    return this.logBuffer.join('\n');
  }
}