'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface StreamingMessageProps {
  content: string;
  speed?: number;
  onComplete?: () => void;
  delay?: number;
}

export function StreamingMessage({
  content,
  speed = 30,
  onComplete,
  delay = 0
}: StreamingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (delay > 0) {
      const timeout = setTimeout(() => setStarted(true), delay);
      return () => clearTimeout(timeout);
    } else {
      setStarted(true);
    }
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    
    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(prev => prev + content[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, content, speed, onComplete, started]);

  if (!started) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded bg-green-950 flex items-center justify-center">
          <Terminal className="h-4 w-4 text-green-500" />
        </div>
        <div className="flex-1 font-mono text-xs text-gray-600">
          <span className="animate-pulse">Processing query...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded bg-green-950 flex items-center justify-center">
          <Terminal className="h-4 w-4 text-green-500" />
        </div>
      </div>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-gray-600">SYSTEM</span>
          <span className="text-gray-700">@</span>
          <span className="text-gray-600">
            {new Date().toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        <Card className="border bg-black border-gray-900">
          <div className="p-3">
            <div className="font-mono text-xs text-gray-300 leading-relaxed">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>,
                  strong: ({ children }) => <strong className="text-green-400 font-semibold">{children}</strong>,
                  code: ({ children }) => <code className="bg-gray-900 px-1 py-0.5 rounded text-green-400">{children}</code>,
                }}
              >
                {displayedContent}
              </ReactMarkdown>
              {currentIndex < content.length && (
                <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1" />
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}