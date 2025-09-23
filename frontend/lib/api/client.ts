import { getIdToken } from '@/lib/firebase/auth';
import {
  ApiResponse,
  Session,
  SessionListResponse,
  SessionDetailsResponse,
  SessionEventsResponse,
  RunRequest,
  AuthVerifyResponse,
  UserInfo,
  ApiError
} from '@/lib/types';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * API client configuration
 */
interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Request interceptor type
 */
type RequestInterceptor = (config: RequestInit) => Promise<RequestInit> | RequestInit;

/**
 * Response interceptor type
 */
type ResponseInterceptor = (response: Response) => Promise<Response> | Response;

/**
 * Enhanced abort controller with timeout tracking
 */
interface EnhancedAbortController extends AbortController {
  timeoutId?: NodeJS.Timeout;
}

/**
 * Main API client class for genomics analysis backend
 */
export class GenomicsAPIClient {
  private config: ApiClientConfig;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private abortControllers: Map<string, EnhancedAbortController> = new Map();

  constructor(config?: Partial<ApiClientConfig>) {
    this.config = {
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
      timeout: 30000, // 30 seconds default timeout
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Get authentication token
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      return await getIdToken();
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  }

  /**
   * Create abort controller for request
   */
  private createAbortController(key: string): AbortController {
    // Clean up existing controller if present
    const existing = this.abortControllers.get(key);
    if (existing) {
      // Clear the timeout if it exists
      if (existing.timeoutId) {
        clearTimeout(existing.timeoutId);
      }
      // Remove from map but don't abort - let existing request complete
      this.abortControllers.delete(key);
    }

    const controller = new AbortController() as EnhancedAbortController;
    this.abortControllers.set(key, controller);

    // Set timeout
    controller.timeoutId = setTimeout(() => {
      // Only abort if this controller is still the active one
      if (this.abortControllers.get(key) === controller) {
        controller.abort(new DOMException('Request timeout', 'TimeoutError'));
        this.abortControllers.delete(key);
      }
    }, this.config.timeout!);

    return controller;
  }

  /**
   * Cancel a request by key
   */
  cancelRequest(key: string): void {
    const controller = this.abortControllers.get(key);
    if (controller) {
      if (controller.timeoutId) {
        clearTimeout(controller.timeoutId);
      }
      controller.abort(new DOMException('Request cancelled', 'AbortError'));
      this.abortControllers.delete(key);
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    this.abortControllers.forEach((controller, key) => {
      if (controller.timeoutId) {
        clearTimeout(controller.timeoutId);
      }
      controller.abort(new DOMException('All requests cancelled', 'AbortError'));
    });
    this.abortControllers.clear();
  }

  /**
   * Apply request interceptors
   */
  private async applyRequestInterceptors(config: RequestInit): Promise<RequestInit> {
    let finalConfig = config;
    for (const interceptor of this.requestInterceptors) {
      finalConfig = await interceptor(finalConfig);
    }
    return finalConfig;
  }

  /**
   * Apply response interceptors
   */
  private async applyResponseInterceptors(response: Response): Promise<Response> {
    let finalResponse = response;
    for (const interceptor of this.responseInterceptors) {
      finalResponse = await interceptor(finalResponse);
    }
    return finalResponse;
  }

  /**
   * Retry logic for failed requests
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    attempts: number = this.config.retryAttempts!
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // Don't retry if it was cancelled
      if (error instanceof DOMException && 
          (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw error;
      }

      if (attempts <= 1) throw error;

      // Don't retry certain HTTP errors
      if (error instanceof APIError &&
          (error.status === 401 || error.status === 403 || error.status === 404)) {
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, this.config.retryDelay!));
      return this.retryRequest(fn, attempts - 1);
    }
  }

  /**
   * Make HTTP request with authentication
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requestKey?: string
  ): Promise<T> {
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = requestKey
      ? this.createAbortController(requestKey)
      : new AbortController();

    let config: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
    };

    // Apply request interceptors
    config = await this.applyRequestInterceptors(config);

    const makeRequest = async () => {
      try {
        const response = await fetch(`${this.config.baseURL}${endpoint}`, config);

        // Apply response interceptors
        const finalResponse = await this.applyResponseInterceptors(response);

        // Clean up abort controller on success
        if (requestKey) {
          const ctrl = this.abortControllers.get(requestKey) as EnhancedAbortController;
          if (ctrl?.timeoutId) {
            clearTimeout(ctrl.timeoutId);
          }
          this.abortControllers.delete(requestKey);
        }

        if (!finalResponse.ok) {
          const errorData = await finalResponse.json().catch(() => ({}));
          throw new APIError(
            errorData.message || errorData.detail || finalResponse.statusText,
            finalResponse.status,
            errorData.code,
            errorData.details
          );
        }

        // Handle empty responses
        const contentType = finalResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          return {} as T;
        }

        return await finalResponse.json();
      } catch (error) {
        // Clean up on error
        if (requestKey) {
          const ctrl = this.abortControllers.get(requestKey) as EnhancedAbortController;
          if (ctrl?.timeoutId) {
            clearTimeout(ctrl.timeoutId);
          }
          this.abortControllers.delete(requestKey);
        }
        throw error;
      }
    };

    return this.retryRequest(makeRequest);
  }

  // ============= Authentication Endpoints =============

  /**
   * Verify Firebase token
   */
  async verifyToken(token: string): Promise<AuthVerifyResponse> {
    return this.request<AuthVerifyResponse>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }, 'auth-verify');
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<UserInfo> {
    return this.request<UserInfo>('/auth/me', {
      method: 'GET',
    }, 'auth-me');
  }

  // ============= Session Management Endpoints =============

  /**
   * Create or continue a chat session (returns raw response for SSE)
   */
  async runAgent(input: RunRequest): Promise<Response> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new APIError('Not authenticated', 401);
    }

    const response = await fetch(`${this.config.baseURL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        errorData.message || errorData.detail || response.statusText,
        response.status,
        errorData.code,
        errorData.details
      );
    }

    return response; // Return raw response for SSE processing
  }

  /**
   * List user sessions
   */
  async listSessions(limit = 20, offset = 0): Promise<SessionListResponse> {
    return this.request<SessionListResponse>(
      `/sessions?limit=${limit}&offset=${offset}`,
      { method: 'GET' },
      'sessions-list'
    );
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<SessionDetailsResponse> {
    return this.request<SessionDetailsResponse>(
      `/sessions/${sessionId}`,
      { method: 'GET' },
      `session-${sessionId}`
    );
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<ApiResponse> {
    return this.request<ApiResponse>(
      `/sessions/${sessionId}`,
      { method: 'DELETE' },
      `session-delete-${sessionId}`
    );
  }

  /**
   * Resume a session
   */
  async resumeSession(sessionId: string): Promise<SessionDetailsResponse> {
    return this.request<SessionDetailsResponse>(
      `/sessions/${sessionId}/resume`,
      { method: 'POST' },
      `session-resume-${sessionId}`
    );
  }

  /**
   * Get session events
   */
  async getSessionEvents(sessionId: string, limit = 50): Promise<SessionEventsResponse> {
    return this.request<SessionEventsResponse>(
      `/sessions/${sessionId}/events?limit=${limit}`,
      { method: 'GET' },
      `session-events-${sessionId}`
    );
  }

  /**
   * Update session metadata
   */
  async updateSessionMetadata(
    sessionId: string,
    updates: Record<string, any>
  ): Promise<ApiResponse> {
    return this.request<ApiResponse>(
      `/sessions/${sessionId}/update`,
      {
        method: 'POST',
        body: JSON.stringify(updates),
      },
      `session-update-${sessionId}`
    );
  }

  /**
   * Cleanup method for component unmounting
   */
  cleanup(): void {
    this.cancelAllRequests();
  }
}

// Create singleton instance
export const apiClient = new GenomicsAPIClient();

// Add response interceptor for development logging only
if (process.env.NODE_ENV === 'development') {
  apiClient.addResponseInterceptor(async (response) => {
    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText} - ${response.url}`);
    }
    return response;
  });
}