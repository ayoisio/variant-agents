'use client';

import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import { ChatMessage } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from 'lucide-react';
import { DetectedVisualization } from '@/lib/visualization/chartDetector';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onVisualizationDetected?: (viz: DetectedVisualization) => void;
  onViewVisualization?: (viz: DetectedVisualization) => void;
}

export function MessageList({ 
  messages, 
  isStreaming,
  onVisualizationDetected,
  onViewVisualization
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    if (shouldAutoScroll.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const isAtBottom = Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 50;
    shouldAutoScroll.current = isAtBottom;
  };

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 p-8">
          <Terminal className="h-12 w-12 text-green-500 mx-auto" />
          <div className="space-y-2">
            <h3 className="font-mono text-sm text-green-500">
              GENOMICS_ANALYSIS_READY
            </h3>
            <p className="font-mono text-xs text-gray-600 max-w-sm">
              Upload VCF file or provide GCS path to begin variant analysis.
              System awaiting input...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea 
      ref={scrollAreaRef}
      className="h-full"
      onScroll={handleScroll}
    >
      <div className="max-w-4xl mx-auto py-4 px-4 space-y-4">
        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            onVisualizationDetected={onVisualizationDetected}
            onViewVisualization={onViewVisualization}
          />
        ))}
        
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded bg-green-950 flex items-center justify-center">
              <span className="text-green-500 text-xs font-mono">AI</span>
            </div>
            <div className="flex-1 font-mono text-xs text-gray-600">
              <span className="animate-pulse">Processing query...</span>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}