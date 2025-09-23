'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { SSEHandler } from '@/components/chat/SSEHandler';
import { HowItWorksModal } from '@/components/chat/HowItWorksModal';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api/client';
import {
  Session,
  SessionDetailsResponse,
  ChatMessage,
  AnalysisState,
  VEPTaskStatus
} from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertCircle, Check, X, Loader2, HelpCircle } from 'lucide-react';

function AnalysisContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const sessionId = params.sessionId as string;
  const isNewSession = sessionId === 'new';

  // State
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    sessionId: isNewSession ? '' : sessionId,
    messages: [],
    isLoading: true,
    isStreaming: false,
    error: undefined
  });

  const [session, setSession] = useState<Session | null>(null);
  const [sseHandler, setSseHandler] = useState<SSEHandler | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Check if first time user (could be stored in localStorage)
  useEffect(() => {
    const hasSeenHelp = localStorage.getItem('hasSeenAnalysisHelp');
    if (!hasSeenHelp && isNewSession) {
      // Show help for first-time users on new sessions
      setTimeout(() => setShowHelpModal(true), 1000);
    }
  }, [isNewSession]);

  // Initialize session
  useEffect(() => {
    if (isNewSession) {
      // New session - set up empty state without generating ID
      setAnalysisState(prev => ({
        ...prev,
        sessionId: '', // Empty string for new sessions
        messages: [{
          id: 'welcome',
          role: 'assistant',
          content: 'Welcome! Please upload a VCF file or provide a GCS path to begin your genomic analysis.',
          timestamp: Date.now()
        }],
        isLoading: false
      }));
      // Don't set currentSessionId yet - wait for backend to generate it
    } else {
      // Existing session - load details and set current session ID
      setCurrentSessionId(sessionId);
      loadSession();
    }
  }, [sessionId]);

  // Load existing session
  const loadSession = async () => {
    try {
      const response = await apiClient.getSession(sessionId);
      setSession(response.metadata);
      setEditedTitle(response.metadata.title);

      // Load session events to reconstruct chat history
      const eventsResponse = await apiClient.getSessionEvents(sessionId);
      const messages = reconstructMessagesFromEvents(eventsResponse.events);

      setAnalysisState(prev => ({
        ...prev,
        messages,
        isLoading: false,
        vepStatus: response.metadata.vep_status ? {
          status: response.metadata.vep_status,
          task_id: response.metadata.vep_task_id || '',
          message: `VEP ${response.metadata.vep_status}`
        } : undefined
      }));
    } catch (error) {
      console.error('Failed to load session:', error);
      setAnalysisState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load session. Please try again.'
      }));
    }
  };

  // Reconstruct messages from session events
  const reconstructMessagesFromEvents = (events: any[]): ChatMessage[] => {
    const messages: ChatMessage[] = [];

    events.forEach(event => {
      if (event.text) {
        messages.push({
          id: event.id || crypto.randomUUID(),
          role: event.author === 'user' ? 'user' : 'assistant',
          content: event.text,
          timestamp: event.timestamp ? event.timestamp * 1000 : Date.now()
        });
      }
    });

    // Sort messages by timestamp to ensure correct order
    messages.sort((a, b) => a.timestamp - b.timestamp);

    return messages;
  };

  // Handle title save
  const handleSaveTitle = async () => {
    if (!session || editedTitle.trim() === session.title) {
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      await apiClient.updateSessionMetadata(session.session_id, { title: editedTitle.trim() });

      // Update local state
      setSession(prev => prev ? { ...prev, title: editedTitle.trim() } : null);
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      setEditedTitle(session.title); // Reset on error
    } finally {
      setIsSavingTitle(false);
    }
  };

  // Handle title cancel
  const handleCancelEdit = () => {
    if (session) {
      setEditedTitle(session.title);
    }
    setIsEditingTitle(false);
  };

  // Send message
  const handleSendMessage = useCallback(async (content: string, vcfPath?: string) => {
    // Create user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: vcfPath ? `Analyze VCF file: ${vcfPath}\n\n${content}` : content,
      timestamp: Date.now()
    };

    // Add to messages
    setAnalysisState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isStreaming: true,
      error: undefined
    }));

    // Create initial assistant message placeholder
    const initialAssistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };

    setAnalysisState(prev => ({
      ...prev,
      messages: [...prev.messages, initialAssistantMessage]
    }));

    // Track state for message handling
    let hasReceivedContent = false;
    let currentAssistantMessageId = initialAssistantMessage.id;
    let lastEventType: string | null = null;
    let messageBuffer = '';
    let isFirstMessage = true;

    try {
      // Create SSE handler
      const handler = new SSEHandler({
        onMessage: (message) => {
          hasReceivedContent = true;
          
          // Skip if no content
          if (!message.content) {
            return;
          }
          
          // Determine if we need a new message bubble
          const shouldCreateNewMessage = 
            !isFirstMessage && 
            message.content && 
            (
              (message.type && message.type !== 'streaming_text' && message.type !== lastEventType) ||
              (message.event?.author && message.event.author !== 'assistant')
            );
          
          if (shouldCreateNewMessage) {
            // Flush buffered content if any
            if (messageBuffer) {
              const bufferedContent = messageBuffer;
              messageBuffer = '';
              
              setAnalysisState(prev => ({
                ...prev,
                messages: prev.messages.map(msg =>
                  msg.id === currentAssistantMessageId
                    ? { ...msg, content: msg.content + bufferedContent, isStreaming: false }
                    : msg
                )
              }));
            }
            
            // Create new message
            const newAssistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: message.content,
              timestamp: Date.now(),
              isStreaming: true
            };
            
            setAnalysisState(prev => ({
              ...prev,
              messages: [...prev.messages, newAssistantMessage]
            }));
            
            currentAssistantMessageId = newAssistantMessage.id;
            isFirstMessage = false;
          } else {
            // Simple append without complex replace logic
            setAnalysisState(prev => ({
              ...prev,
              messages: prev.messages.map(msg =>
                msg.id === currentAssistantMessageId
                  ? { ...msg, content: msg.content + message.content }
                  : msg
              )
            }));
            
            if (isFirstMessage) {
              isFirstMessage = false;
            }
          }
          
          lastEventType = message.type || 'streaming_text';
        },
        
        // Handle visualization detection
        onVisualizationDetected: (viz) => {
          console.log('Visualization detected in page:', viz);
          
          // Attach visualization to the current assistant message's metadata
          setAnalysisState(prev => ({
            ...prev,
            messages: prev.messages.map(msg =>
              msg.id === currentAssistantMessageId
                ? { 
                    ...msg, 
                    metadata: { 
                      ...msg.metadata, 
                      visualization: viz,
                      event: viz
                    } 
                  }
                : msg
            )
          }));
        },
        
        onMetadata: (metadata) => {
          // Handle session metadata for new sessions
          if (metadata.session_id && !currentSessionId && isNewSession) {
            const newSessionId = metadata.session_id;
            
            // Update URL immediately when we get the session ID
            window.history.replaceState(null, '', `/analysis/${newSessionId}`);
            setCurrentSessionId(newSessionId);
            
            setAnalysisState(prev => ({
              ...prev,
              sessionId: newSessionId
            }));
          }
          
          // Update session state
          if (metadata.session) {
            setSession(prev => {
              const sessionData = metadata.session as any;
              
              // Handle title updates
              if (!prev && sessionData.title) {
                setEditedTitle(sessionData.title);
              } else if (prev && sessionData.title && sessionData.title !== prev.title) {
                setEditedTitle(sessionData.title);
              }

              // Merge session data
              const updated = prev ? {
                ...prev,
                ...sessionData
              } as Session : sessionData as Session;

              return updated;
            });
          }

          // Handle progress updates
          const progress = metadata.progress;
          if (progress && typeof progress.estimated_progress === 'number') {
            setAnalysisState(prev => ({
              ...prev,
              vepProgress: progress.estimated_progress
            }));
          }
          
          // Handle VEP status from metadata
          if (metadata.session?.vep_status) {
            setAnalysisState(prev => ({
              ...prev,
              vepStatus: {
                status: metadata.session!.vep_status!,
                task_id: metadata.session!.vep_task_id || '',
                message: `VEP ${metadata.session!.vep_status}`
              }
            }));
          }
        },
        
        onComplete: () => {
          // Flush any remaining buffered content
          if (messageBuffer) {
            const finalContent = messageBuffer;
            messageBuffer = '';
            
            setAnalysisState(prev => ({
              ...prev,
              messages: prev.messages.map(msg =>
                msg.id === currentAssistantMessageId
                  ? { ...msg, content: msg.content + finalContent }
                  : msg
              )
            }));
          }
          
          // Mark all streaming messages as complete
          setAnalysisState(prev => ({
            ...prev,
            isStreaming: false,
            messages: prev.messages.map(msg =>
              msg.isStreaming ? { ...msg, isStreaming: false } : msg
            )
          }));
        },
        
        onError: (error) => {
          console.error('SSE error:', error);
          
          // Only show error if we haven't received any content
          if (!hasReceivedContent) {
            setAnalysisState(prev => ({
              ...prev,
              isStreaming: false,
              error: 'Failed to connect. Please try again.'
            }));
          } else {
            // We got content, just complete the stream
            if (messageBuffer) {
              const finalContent = messageBuffer;
              messageBuffer = '';
              
              setAnalysisState(prev => ({
                ...prev,
                messages: prev.messages.map(msg =>
                  msg.id === currentAssistantMessageId
                    ? { ...msg, content: msg.content + finalContent, isStreaming: false }
                    : msg
                )
              }));
            }
            
            setAnalysisState(prev => ({
              ...prev,
              isStreaming: false,
              messages: prev.messages.map(msg =>
                msg.isStreaming ? { ...msg, isStreaming: false } : msg
              )
            }));
          }
        },
        
        debug: true  // Enable debug mode for troubleshooting
      });

      setSseHandler(handler);

      // Determine session ID to use
      let sessionToUse: string | undefined;
      if (currentSessionId) {
        sessionToUse = currentSessionId;
      } else if (!isNewSession) {
        sessionToUse = sessionId;
      } else {
        sessionToUse = undefined;
      }

      // Start streaming
      await handler.connect(content, sessionToUse);

      // Handle new session ID from SSE handler (fallback)
      if (isNewSession && !currentSessionId && handler.sessionId) {
        const newSessionId = handler.sessionId;

        // Update everything with the new session ID
        window.history.replaceState(null, '', `/analysis/${newSessionId}`);
        setCurrentSessionId(newSessionId);

        setAnalysisState(prev => ({
          ...prev,
          sessionId: newSessionId
        }));

        // Create default session if needed
        if (!session) {
          const now = new Date();
          const defaultTitle = `Analysis ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          setSession({
            session_id: newSessionId,
            firebase_uid: user?.uid || '',
            created_at: now,
            updated_at: now,
            status: 'active',
            title: defaultTitle,
            vcf_path: vcfPath || null
          } as Session);

          setEditedTitle(defaultTitle);
        }
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Only show error if we haven't received content
      if (!hasReceivedContent) {
        setAnalysisState(prev => ({
          ...prev,
          isStreaming: false,
          error: 'Failed to send message. Please try again.'
        }));
      } else {
        // Complete any streaming messages
        setAnalysisState(prev => ({
          ...prev,
          isStreaming: false,
          messages: prev.messages.map(msg =>
            msg.isStreaming ? { ...msg, isStreaming: false } : msg
          )
        }));
      }
    }
  }, [sessionId, isNewSession, user, currentSessionId, session]);

  // Handle VEP status update
  const handleVEPStatusUpdate = useCallback((status: VEPTaskStatus) => {
    setAnalysisState(prev => ({
      ...prev,
      vepStatus: status
    }));
  }, []);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      sseHandler?.disconnect();
    };
  }, [sseHandler]);

  if (analysisState.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="space-y-4">
          <div className="dna-loader" />
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if (analysisState.error && !analysisState.messages.length) {
    return (
      <div className="h-screen flex items-center justify-center p-4">
        <div className="max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{analysisState.error}</AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Session Title Header */}
      {session && session.session_id && (
        <div className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="container px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/dashboard')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="h-8 text-sm font-medium w-64"
                      autoFocus
                      disabled={isSavingTitle}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleSaveTitle}
                      disabled={isSavingTitle}
                    >
                      {isSavingTitle ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleCancelEdit}
                      disabled={isSavingTitle}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <h1
                    className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setIsEditingTitle(true)}
                    title="Click to rename"
                  >
                    {session.title || 'New Analysis'}
                  </h1>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHelpModal(true)}
                  className="h-8 w-8"
                  title="How it works"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
                
                <div className="text-xs text-muted-foreground">
                  Session ID: {session.session_id?.slice(0, 8) || 'loading'}...
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ChatInterface
        analysisState={analysisState}
        session={session}
        onSendMessage={handleSendMessage}
        onVEPStatusUpdate={handleVEPStatusUpdate}
      />

      {/* How It Works Modal */}
      <HowItWorksModal 
        open={showHelpModal} 
        onOpenChange={setShowHelpModal} 
      />

      {/* Floating Help Button - Always Visible */}
      <Button
        onClick={() => setShowHelpModal(true)}
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all z-50"
        size="icon"
        title="How it works"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
    </>
  );
}

export default function AnalysisPage() {
  return (
    <ProtectedRoute>
      <AnalysisContent />
    </ProtectedRoute>
  );
}