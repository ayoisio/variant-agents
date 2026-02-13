'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChatMessage } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ProgressTracker } from '@/components/analysis/ProgressTracker';
import {
  Copy,
  Check,
  User,
  Terminal,
  FileText,
  Hash,
  Activity,
  Database,
  BarChart3,
  Eye
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ChartDetector, DetectedVisualization } from '@/lib/visualization/chartDetector';

interface MessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onVisualizationDetected?: (viz: DetectedVisualization) => void;
  onViewVisualization?: (viz: DetectedVisualization) => void;
}

export function MessageItem({
  message,
  isLast,
  onVisualizationDetected,
  onViewVisualization
}: MessageItemProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const [displayedContent, setDisplayedContent] = useState('');
  const [detectedVisualization, setDetectedVisualization] = useState<DetectedVisualization | null>(null);

  // Detect VEP task ID from message content
  // The LLM rephrases tool output freely, so we try multiple patterns
  const vepTaskId = useMemo(() => {
    if (isUser) return null;
    const content = message.content;

    // Pattern 1: Explicit task ID phrases (most common LLM phrasings)
    const explicitPatterns = [
      /task[_ ]id[\s:]+([a-f0-9-]{36})/i,          // task_id: X, task ID: X, task id X
      /task ID is ([a-f0-9-]{36})/i,                // task ID is X
      /(?:tracking|task)\s+ID[:\s]+([a-f0-9-]{36})/i, // tracking ID: X
      /with (?:ID|id)\s+([a-f0-9-]{36})/i,         // with ID X
      /`([a-f0-9-]{36})`/,                          // `uuid` in backticks
    ];

    for (const pattern of explicitPatterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }

    // Pattern 2: Any UUID in a message mentioning VEP or annotation
    if (/\b(?:vep|annotation|dispatched|background processing)\b/i.test(content)) {
      const uuidMatch = content.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/);
      if (uuidMatch) return uuidMatch[1];
    }

    return null;
  }, [message.content, isUser]);

  useEffect(() => {
    if (message.isStreaming && isLast) {
      setDisplayedContent(message.content);
    } else {
      setDisplayedContent(message.content);
    }
  }, [message.content, message.isStreaming, isLast]);

  // Detect visualizations in message
  useEffect(() => {
    if (message.metadata) {
      // Check if visualization is directly in metadata
      if (message.metadata.visualization) {
        console.log('MessageItem found visualization in metadata:', message.metadata.visualization);
        setDetectedVisualization(message.metadata.visualization);
        onVisualizationDetected?.(message.metadata.visualization);
      }
      // Also try detecting from event structure
      else if (message.metadata.event) {
        const viz = ChartDetector.detectInSSEEvent({
          event: message.metadata.event
        });

        if (viz) {
          console.log('MessageItem detected viz from event:', viz);
          setDetectedVisualization(viz);
          onVisualizationDetected?.(viz);
        }
      }
    }

    // Check for chart intent in text (for debugging)
    if (message.content) {
      const intent = ChartDetector.detectChartIntent(message.content);
      if (intent.detected && !detectedVisualization) {
        console.log('Chart request detected:', intent);
      }
    }
  }, [message, onVisualizationDetected]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get user display name (first name or email prefix)
  const getUserDisplayName = () => {
    if (user?.displayName) {
      // Return first name only
      return user.displayName.split(' ')[0];
    }
    if (user?.email) {
      // Return email prefix before @
      return user.email.split('@')[0];
    }
    return 'USER';
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (user?.displayName) {
      return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="w-8 h-8 rounded overflow-hidden">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                <span className="text-xs font-medium text-gray-400">{getUserInitials()}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-8 h-8 rounded bg-green-950 flex items-center justify-center">
            <Terminal className="h-4 w-4 text-green-500" />
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 space-y-1 ${isUser ? 'items-end' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 font-mono text-xs ${isUser ? 'justify-end' : ''}`}>
          <span className="text-gray-600">
            {isUser ? getUserDisplayName() : 'SYSTEM'}
          </span>
          <span className="text-gray-700">@</span>
          <span className="text-gray-600">
            {formatTimestamp(message.timestamp)}
          </span>
          {message.metadata?.function_call && (
            <Badge variant="outline" className="border-blue-900 text-blue-500 text-xs">
              FN_{message.metadata.function_call.toUpperCase()}
            </Badge>
          )}
        </div>

        {/* Message Card */}
        <Card className={`border ${isUser ? 'bg-gray-950 border-gray-800' : 'bg-black border-gray-900'
          }`}>
          <div className="p-3">
            {/* VCF Path Display */}
            {message.content.includes('gs://') && (
              <div className="flex items-center gap-2 mb-2 p-2 bg-gray-950 rounded border border-gray-900">
                <FileText className="h-3 w-3 text-green-500" />
                <code className="text-xs text-green-400 font-mono">
                  {message.content.match(/gs:\/\/[^\s]+/)?.[0]}
                </code>
              </div>
            )}

            {/* Message Text */}
            <div className="font-mono text-xs text-gray-300 leading-relaxed">
              {isUser ? (
                <pre className="whitespace-pre-wrap">{displayedContent}</pre>
              ) : (
                <ReactMarkdown
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const inline = !match;

                      return !inline ? (
                        <SyntaxHighlighter
                          style={oneDark as any}
                          language={match![1]}
                          PreTag="div"
                          className="text-xs"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className="bg-gray-900 px-1 py-0.5 rounded text-green-400" {...props}>
                          {children}
                        </code>
                      );
                    },
                    p: ({ children }: any) => <p className="mb-2">{children}</p>,
                    ul: ({ children }: any) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                    ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                  }}
                >
                  {displayedContent}
                </ReactMarkdown>
              )}
            </div>

            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-green-500 animate-pulse" />
            )}

            {/* VEP Progress Tracker */}
            {vepTaskId && (
              <ProgressTracker taskId={vepTaskId} />
            )}

            {/* Visualization Indicator (Terminal Style) */}
            {detectedVisualization && (
              <div className="mt-3 p-2 bg-gray-950 rounded border border-gray-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-3 w-3 text-green-500" />
                    <div className="font-mono text-xs">
                      <span className="text-gray-600">VISUALIZATION: </span>
                      <span className="text-green-400">
                        {detectedVisualization.type.toUpperCase()}
                      </span>
                      {detectedVisualization.title && (
                        <span className="text-gray-600 ml-2">
                          [{detectedVisualization.title}]
                        </span>
                      )}
                    </div>
                  </div>
                  {onViewVisualization && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewVisualization(detectedVisualization)}
                      className="h-6 px-2 font-mono text-xs hover:bg-gray-900"
                    >
                      <Eye className="h-3 w-3 mr-1 text-gray-600" />
                      <span className="text-gray-600">VIEW</span>
                    </Button>
                  )}
                </div>
                {detectedVisualization.metadata && (
                  <div className="mt-1 font-mono text-xs text-gray-600">
                    DATA_POINTS: <span className="text-gray-400">
                      {detectedVisualization.metadata.dataPoints}
                    </span>
                    {detectedVisualization.metadata.context && (
                      <span className="ml-2">
                        MODE: <span className="text-gray-400">
                          {detectedVisualization.metadata.context}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Metadata Display */}
            {message.metadata && (
              <div className="mt-3 pt-3 border-t border-gray-900 space-y-1 font-mono text-xs">
                {message.metadata.variant_count !== undefined && (
                  <div className="text-gray-600">
                    VARIANTS_ANALYZED: <span className="text-gray-400">
                      {message.metadata.variant_count.toLocaleString()}
                    </span>
                  </div>
                )}
                {message.metadata.pathogenic_count !== undefined && (
                  <div className="text-gray-600">
                    PATHOGENIC_FOUND: <span className="text-red-500">
                      {message.metadata.pathogenic_count}
                    </span>
                  </div>
                )}
                {message.metadata.vep_status && (
                  <div className="text-gray-600">
                    VEP_STATUS: <span className="text-blue-500">
                      {message.metadata.vep_status.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Actions */}
        {!isUser && !message.isStreaming && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 font-mono text-xs hover:bg-gray-900"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-green-500" />
                  <span className="text-green-500">COPIED</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1 text-gray-600" />
                  <span className="text-gray-600">COPY</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}