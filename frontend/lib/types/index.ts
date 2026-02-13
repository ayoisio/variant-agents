// lib/types/index.ts

// ============= Base Types =============

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * API error response
 */
export interface ApiError {
  status: 'error';
  message: string;
  code?: string;
  details?: any;
}

// ============= User & Auth Types =============

/**
 * User information from Firebase
 */
export interface UserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  firebase_uid?: string;
}

/**
 * Auth verification response
 */
export interface AuthVerifyResponse {
  status: 'success' | 'error';
  valid: boolean;
  user?: UserInfo;
  message?: string;
}

// ============= Session Types =============

/**
 * Session metadata stored in Firestore
 */
export interface Session {
  session_id: string;
  firebase_uid: string;
  created_at: any; // Firestore timestamp
  updated_at: any; // Firestore timestamp
  status: 'active' | 'processing' | 'completed' | 'error' | 'analyzing';
  vcf_path?: string | null;
  vep_task_id?: string | null;
  vep_status?: 'pending' | 'running' | 'completed' | 'failed' | null;
  title: string;
  summary?: string | null;
  variant_count?: number | null;
  pathogenic_count?: number | null;
  annotations_count?: number | null;
  error_message?: string | null;
  notes?: string;
  tags?: string[];
}

/**
 * Session list response
 */
export interface SessionListResponse {
  status: 'success';
  sessions: Session[];
  count: number;
  limit: number;
  offset: number;
}

/**
 * Session details response
 */
export interface SessionDetailsResponse {
  status: 'success';
  session_id: string;
  metadata: Session;
  state: Record<string, any>;
  events_count: number;
}

/**
 * Session event from ADK
 */
export interface SessionEvent {
  id: string;
  author: string;
  timestamp: number;
  invocation_id?: string;
  text?: string;
  state_changes?: Record<string, any>;
  transfer_to?: string;
}

/**
 * Session events response
 */
export interface SessionEventsResponse {
  status: 'success';
  session_id: string;
  events: SessionEvent[];
  total_count: number;
  returned_count: number;
}

// ============= Agent/Run Types =============

/**
 * Request to run agent
 */
export interface RunRequest {
  input_text: string;
  session_id?: string | null;
}

// ============= SSE Event Types =============

/**
 * Event types for classification
 */
export type EventType =
  | 'streaming_text'
  | 'final_response'
  | 'function_call'
  | 'function_response'
  | 'vep_started'
  | 'vep_status_check'
  | 'vep_start_response'
  | 'vep_status_response'
  | 'clinical_assessment_complete'
  | 'state_update'
  | 'general';

/**
 * VEP progress information
 */
export interface VEPProgress {
  status: string;
  estimated_progress: number; // 0-100
  message: string;
}

/**
 * Real-time task progress from Firestore background_tasks collection
 */
export interface TaskProgress {
  current_batch: number;
  total_batches: number;
  progress_pct: number;
  annotations_added: number;
  am_scores_found: number;
}

/**
 * Enhanced SSE metadata from backend
 */
export interface SSEMetadata {
  session_id: string;
  user_id: string;
  firebase_uid: string;
  timestamp: number;
  event_type: string;
  session?: {
    status: string;
    vep_status?: string;
    vep_task_id?: string;
    variant_count?: number;
    pathogenic_count?: number;
  };
  progress?: VEPProgress;
  visualization?: any;
}

/**
 * Part of content in SSE event
 */
export interface SSEContentPart {
  text?: string;
  function_call?: {
    name: string;
    args?: any;
  };
  function_response?: {
    name: string;
    response?: any;
  };
}

/**
 * SSE event content
 */
export interface SSEContent {
  parts: SSEContentPart[];
  role?: string;
}

/**
 * Raw SSE event from ADK
 */
export interface SSEEvent {
  id?: string;
  author?: string;
  content?: SSEContent;
  timestamp?: number;
  invocation_id?: string;
  partial?: boolean;
  is_final_response?: boolean;
  turn_complete?: boolean;
  actions?: {
    state_delta?: Record<string, any>;
    transfer_to_agent?: string;
    escalate?: boolean;
  };
  error_code?: string;
  error_message?: string;
}

/**
 * Processed SSE message for UI
 */
export interface SSEMessage {
  id: string;
  type: EventType;
  content: string;
  metadata: SSEMetadata;
  event: SSEEvent;
  timestamp: number;
}

// ============= Variant Analysis Types =============

/**
 * Variant data structure
 */
export interface Variant {
  variant_id: string;
  chromosome: string;
  position: number;
  reference: string;
  alternate: string;
  gene?: string;
  consequence?: string;
  impact?: string;
  frequency?: number;
  clinical_significance?: string;
  condition?: string;
  acmg_criteria?: string[];
}

/**
 * Clinical assessment result
 */
export interface ClinicalAssessment {
  status: 'success' | 'error';
  summary?: string;
  recommendations?: string[] | string;
  key_findings?: string[] | string;
  message?: string;
}

/**
 * VEP task status
 */
export interface VEPTaskStatus {
  status: string;
  task_id: string;
  message?: string;
  output_artifact?: string;
  error?: string;
}

// ============= UI State Types =============

/**
 * Chat message for UI display
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  metadata?: {
    function_call?: string;
    vep_status?: string;
    variant_count?: number;
    pathogenic_count?: number;
    visualization?: any;
    event?: any;
  };
}

/**
 * Analysis state for UI
 */
export interface AnalysisState {
  sessionId?: string;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  vepStatus?: VEPTaskStatus;
  vepProgress?: number;
  clinicalReport?: ClinicalAssessment;
  variants?: Variant[];
  error?: string;
}

/**
 * Session filter options
 */
export interface SessionFilters {
  status?: Session['status'];
  dateFrom?: Date;
  dateTo?: Date;
  searchTerm?: string;
  hasVCF?: boolean;
  hasPathogenic?: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
  total?: number;
  page?: number;
}

/**
 * Visualization
 */
export interface Visualization {
  id: string;
  type: string;
  title: string;
  data: any;
  timestamp: Date;
  metadata?: any;
}