// components/analysis/ProgressTracker.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Cpu,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Terminal,
  Dna
} from 'lucide-react';
import { useTaskProgress } from '@/hooks/useTaskProgress';

interface ProgressTrackerProps {
  taskId: string;
}

export function ProgressTracker({ taskId }: ProgressTrackerProps) {
  const { status, progress, logs, error } = useTaskProgress(taskId);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pending': return 'text-yellow-500';
      case 'running': return 'text-blue-500';
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'progress': return 'text-green-400';
      case 'am': return 'text-cyan-400';
      case 'complete': return 'text-green-300 font-semibold';
      case 'error': return 'text-red-400';
      default: return 'text-gray-500';
    }
  };

  const progressPct = progress?.progress_pct ?? 0;

  return (
    <Card className="bg-black border-green-900/50 my-2">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-green-500" />
              <span className="font-mono text-xs text-green-500">
                VEP_ANNOTATION_ENGINE
              </span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className={`font-mono text-xs ${getStatusColor()}`}>
                {(status ?? 'loading').toUpperCase()}
              </span>
            </div>
          </div>

          {/* Task Info */}
          <div className="font-mono text-xs text-gray-600 space-y-1">
            <div>TASK_ID: {taskId.slice(0, 12)}...</div>
            {progress && (
              <div className="flex items-center gap-4">
                <span>BATCH: {progress.current_batch}/{progress.total_batches}</span>
                {progress.am_scores_found > 0 && (
                  <span className="flex items-center gap-1 text-cyan-500">
                    <Dna className="h-3 w-3" />
                    AM: {progress.am_scores_found}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {(status === 'running' || status === 'pending') && (
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-gray-600">PROGRESS</span>
                <span className="text-green-500">{progressPct.toFixed(1)}%</span>
              </div>
              <Progress
                value={progressPct}
                className="h-1 bg-gray-900"
              />
            </div>
          )}

          {/* Terminal Log View */}
          <div className="pt-2 border-t border-gray-900">
            <div className="flex items-center gap-1 mb-2">
              <Terminal className="h-3 w-3 text-gray-600" />
              <span className="font-mono text-xs text-gray-600">LOG OUTPUT</span>
            </div>
            <div
              ref={logContainerRef}
              className="bg-gray-950 rounded p-2 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800"
            >
              {logs.length === 0 ? (
                <div className="font-mono text-xs text-gray-700 animate-pulse">
                  Waiting for task data...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`font-mono text-xs ${getLogColor(log.type)} leading-5`}>
                    <span className="text-gray-700">[{log.timestamp}]</span>{' '}
                    {log.type === 'am' ? '🧬 ' : ''}{log.message}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="font-mono text-xs text-red-500 pt-2 border-t border-gray-900">
              ERROR: {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}