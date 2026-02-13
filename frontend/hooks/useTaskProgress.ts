// hooks/useTaskProgress.ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { TaskProgress } from '@/lib/types';

interface TaskLogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'progress' | 'am' | 'complete' | 'error';
}

interface UseTaskProgressReturn {
    status: 'pending' | 'running' | 'completed' | 'failed' | null;
    progress: TaskProgress | null;
    logs: TaskLogEntry[];
    error: string | null;
}

const MAX_LOG_ENTRIES = 200;

function makeTimestamp(): string {
    return new Date().toISOString().slice(11, 19);
}

export function useTaskProgress(taskId: string | null): UseTaskProgressReturn {
    const [status, setStatus] = useState<UseTaskProgressReturn['status']>(null);
    const [progress, setProgress] = useState<TaskProgress | null>(null);
    const [logs, setLogs] = useState<TaskLogEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const prevBatchRef = useRef<number>(0);
    const completedRef = useRef<boolean>(false);

    // Append logs with cap to prevent unbounded growth
    const appendLogs = useCallback((entries: TaskLogEntry[]) => {
        setLogs(prev => {
            const combined = [...prev, ...entries];
            if (combined.length > MAX_LOG_ENTRIES) {
                return combined.slice(combined.length - MAX_LOG_ENTRIES);
            }
            return combined;
        });
    }, []);

    useEffect(() => {
        if (!taskId) return;

        // Reset state for new taskId
        prevBatchRef.current = 0;
        completedRef.current = false;
        setStatus(null);
        setProgress(null);
        setError(null);
        setLogs([{
            timestamp: makeTimestamp(),
            message: `Subscribing to task ${taskId.slice(0, 12)}...`,
            type: 'info'
        }]);

        const taskRef = doc(db, 'background_tasks', taskId);
        const unsubscribe = onSnapshot(
            taskRef,
            (snapshot) => {
                if (!snapshot.exists()) return;

                const data = snapshot.data();
                const newStatus = data.status as UseTaskProgressReturn['status'];
                setStatus(newStatus);

                if (data.error) {
                    setError(data.error);
                    appendLogs([{
                        timestamp: makeTimestamp(),
                        message: `ERROR: ${data.error}`,
                        type: 'error'
                    }]);
                }

                if (data.progress) {
                    const prog = data.progress as TaskProgress;
                    setProgress(prog);

                    // Only add log if batch actually changed (avoid duplicates)
                    if (prog.current_batch !== prevBatchRef.current) {
                        prevBatchRef.current = prog.current_batch;

                        const newLogs: TaskLogEntry[] = [{
                            timestamp: makeTimestamp(),
                            message: `Batch ${prog.current_batch}/${prog.total_batches} — ${prog.progress_pct}% — ${prog.annotations_added.toLocaleString()} annotations`,
                            type: 'progress'
                        }];

                        if (prog.am_scores_found > 0) {
                            newLogs.push({
                                timestamp: makeTimestamp(),
                                message: `AlphaMissense scores: ${prog.am_scores_found.toLocaleString()} cumulative`,
                                type: 'am'
                            });
                        }

                        appendLogs(newLogs);
                    }
                }

                // Guard against duplicate completion log entries
                if (newStatus === 'completed' && !completedRef.current) {
                    completedRef.current = true;
                    appendLogs([{
                        timestamp: makeTimestamp(),
                        message: 'VEP annotation complete. Ready for report generation.',
                        type: 'complete'
                    }]);
                }
            },
            (err) => {
                setError(err.message);
                appendLogs([{
                    timestamp: makeTimestamp(),
                    message: `Firestore error: ${err.message}`,
                    type: 'error'
                }]);
            }
        );

        return () => unsubscribe();
    }, [taskId, appendLogs]);

    return { status, progress, logs, error };
}
