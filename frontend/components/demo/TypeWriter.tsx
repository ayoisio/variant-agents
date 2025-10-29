'use client';

import { useState, useEffect } from 'react';

interface TypeWriterProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
  cursor?: boolean;
}

export function TypeWriter({
  text,
  speed = 50,
  onComplete,
  className = '',
  cursor = true
}: TypeWriterProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  // Cursor blink
  useEffect(() => {
    if (!cursor) return;
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, [cursor]);

  return (
    <span className={className}>
      {displayedText}
      {cursor && currentIndex < text.length && (
        <span className={showCursor ? 'opacity-100' : 'opacity-0'}>_</span>
      )}
    </span>
  );
}