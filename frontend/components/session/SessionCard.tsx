// components/session/SessionCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@/lib/types';
import { SessionActions } from './SessionActions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { 
  Hash,
  FileText,
  Clock,
  Activity,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Database,
  Cpu,
  ExternalLink
} from 'lucide-react';

interface SessionCardProps {
  session: Session;
  onDelete?: (sessionId: string) => void;
  onUpdate?: (session: Session) => void;
  isSelected?: boolean;
  onSelect?: (sessionId: string) => void;
}

export function SessionCard({ 
  session, 
  onDelete, 
  onUpdate,
  isSelected = false,
  onSelect
}: SessionCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusConfig = () => {
    const configs = {
      active: { 
        icon: Activity, 
        color: 'text-blue-500', 
        bgColor: 'bg-blue-950/20',
        label: 'ACTIVE',
        animate: false
      },
      processing: { 
        icon: Loader2, 
        color: 'text-yellow-500', 
        bgColor: 'bg-yellow-950/20',
        label: 'PROCESSING', 
        animate: true 
      },
      analyzing: { 
        icon: Cpu, 
        color: 'text-purple-500',
        bgColor: 'bg-purple-950/20', 
        label: 'ANALYZING', 
        animate: true 
      },
      completed: { 
        icon: CheckCircle, 
        color: 'text-green-500',
        bgColor: 'bg-green-950/20', 
        label: 'COMPLETE',
        animate: false
      },
      error: { 
        icon: AlertTriangle, 
        color: 'text-red-500',
        bgColor: 'bg-red-950/20', 
        label: 'FAILED',
        animate: false
      }
    };
    
    return configs[session.status] || configs.active;
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(session.session_id);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/analysis/${session.session_id}`);
  };

  return (
    <Card 
      className={`bg-black border transition-all cursor-pointer ${
        isSelected 
          ? 'border-green-900 shadow-[0_0_20px_rgba(34,197,94,0.1)]' 
          : 'border-gray-900 hover:border-green-900/50'
      }`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Hash className="h-3 w-3 text-gray-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-green-500">
                    {session.session_id.slice(0, 8)}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`border-gray-800 ${statusConfig.color} font-mono text-xs`}
                  >
                    <StatusIcon className={`h-3 w-3 mr-1 ${statusConfig.animate ? 'animate-spin' : ''}`} />
                    {statusConfig.label}
                  </Badge>
                  <span className="font-mono text-xs text-gray-600">
                    {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-gray-900"
                onClick={handleNavigate}
              >
                <ExternalLink className="h-3 w-3 text-gray-600" />
              </Button>
              <SessionActions 
                session={session} 
                onDelete={onDelete}
                onUpdate={onUpdate}
              />
            </div>
          </div>

          {/* File Info */}
          {session.vcf_path && (
            <div className="flex items-center gap-2 font-mono text-xs text-gray-600">
              <FileText className="h-3 w-3" />
              <span className="truncate">{session.vcf_path.split('/').pop()}</span>
            </div>
          )}

          {/* Metrics Row */}
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            {session.variant_count !== null && session.variant_count !== undefined && (
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3 text-gray-700" />
                <span className="text-gray-600">VARIANTS:</span>
                <span className="text-gray-400">{session.variant_count.toLocaleString()}</span>
              </div>
            )}
            
            {session.pathogenic_count !== null && session.pathogenic_count !== undefined && session.pathogenic_count > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-600" />
                <span className="text-gray-600">PATHOGENIC:</span>
                <span className="text-red-500">{session.pathogenic_count}</span>
              </div>
            )}
            
            {session.vep_status && (
              <div className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-blue-600" />
                <span className="text-gray-600">VEP:</span>
                <span className={
                  session.vep_status === 'completed' ? 'text-green-500' :
                  session.vep_status === 'failed' ? 'text-red-500' :
                  'text-blue-500'
                }>
                  {session.vep_status.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Summary (if exists) */}
          {session.summary && (
            <div className="font-mono text-xs text-gray-500 line-clamp-2">
              {session.summary}
            </div>
          )}

          {/* Expanded Details */}
          {isExpanded && (
            <div className="pt-3 mt-3 border-t border-gray-900 space-y-2">
              <pre className="font-mono text-xs text-gray-700 overflow-x-auto">
{`SESSION_DETAILS:
----------------
ID: ${session.session_id}
CREATED: ${new Date(session.created_at).toISOString()}
UPDATED: ${new Date(session.updated_at).toISOString()}
STATUS: ${session.status}
${session.vep_task_id ? `VEP_TASK: ${session.vep_task_id}` : ''}
${session.error_message ? `ERROR: ${session.error_message}` : ''}
${session.tags?.length ? `TAGS: ${session.tags.join(', ')}` : ''}`}
              </pre>
            </div>
          )}

          {/* Expand Indicator */}
          {(session.summary || session.error_message) && !isExpanded && (
            <div className="flex justify-center pt-2">
              <ChevronRight className="h-3 w-3 text-gray-700" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}