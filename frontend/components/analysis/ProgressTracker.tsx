// components/analysis/ProgressTracker.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Cpu,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle,
  Hash,
  Loader2
} from 'lucide-react';

interface ProgressTrackerProps {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  startTime?: Date;
  estimatedDuration?: number;
  variantCount?: number;
  message?: string;
  error?: string;
}

export function ProgressTracker({
  taskId,
  status,
  progress = 0,
  startTime,
  estimatedDuration = 300,
  variantCount,
  message,
  error
}: ProgressTrackerProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [cpuLoad, setCpuLoad] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    if (status === 'running' && startTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
        setElapsedTime(elapsed);
        
        // Simulate CPU/memory metrics
        setCpuLoad(60 + Math.random() * 30);
        setMemoryUsage(40 + Math.random() * 20);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [status, startTime]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  return (
    <Card className="bg-black border-green-900/50">
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
                {status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Task Info */}
          <div className="font-mono text-xs text-gray-600 space-y-1">
            <div>TASK_ID: {taskId.slice(0, 12)}...</div>
            {variantCount && (
              <div>VARIANTS: {variantCount.toLocaleString()}</div>
            )}
            {status === 'running' && (
              <div>ELAPSED: {formatTime(elapsedTime)}</div>
            )}
          </div>

          {/* Progress Bar */}
          {status === 'running' && (
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-gray-600">PROGRESS</span>
                <span className="text-green-500">{progress.toFixed(0)}%</span>
              </div>
              <Progress 
                value={progress} 
                className="h-1 bg-gray-900"
              />
            </div>
          )}

          {/* System Metrics */}
          {status === 'running' && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-900">
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-gray-600">CPU</span>
                  <span className={cpuLoad > 80 ? 'text-yellow-500' : 'text-green-500'}>
                    {cpuLoad.toFixed(0)}%
                  </span>
                </div>
                <Progress 
                  value={cpuLoad} 
                  className="h-1 bg-gray-900"
                />
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-gray-600">MEM</span>
                  <span className="text-green-500">
                    {memoryUsage.toFixed(0)}%
                  </span>
                </div>
                <Progress 
                  value={memoryUsage} 
                  className="h-1 bg-gray-900"
                />
              </div>
            </div>
          )}

          {/* Status Message */}
          {message && (
            <div className="font-mono text-xs text-gray-500 pt-2 border-t border-gray-900">
              {status === 'running' && '> '}{message}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="font-mono text-xs text-red-500 pt-2 border-t border-gray-900">
              ERROR: {error}
            </div>
          )}

          {/* Log Output */}
          {status === 'running' && (
            <div className="font-mono text-xs text-gray-700 space-y-1 pt-2 border-t border-gray-900">
              <div>[VEP] Loading cache...</div>
              <div>[VEP] Processing batch {Math.floor(progress / 10) + 1}/10</div>
              <div className="animate-pulse">[VEP] Annotating variants...</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}