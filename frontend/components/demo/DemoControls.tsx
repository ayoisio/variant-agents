'use client';

import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface DemoControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export function DemoControls({
  isPlaying,
  onPlay,
  onPause,
  onRestart
}: DemoControlsProps) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg p-2">
        {isPlaying ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onPause}
            className="h-8 w-8 hover:bg-gray-900"
          >
            <Pause className="h-4 w-4 text-gray-400" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={onPlay}
            className="h-8 w-8 hover:bg-gray-900"
          >
            <Play className="h-4 w-4 text-green-500" />
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onRestart}
          className="h-8 w-8 hover:bg-gray-900"
        >
          <RotateCcw className="h-4 w-4 text-gray-400" />
        </Button>
        
        <div className="h-4 w-px bg-gray-800 mx-1" />
        
        <div className="font-mono text-xs text-gray-600 px-2">
          {isPlaying ? 'PLAYING' : 'PAUSED'}
        </div>
      </div>
    </div>
  );
}