// components/session/SessionActions.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@/lib/types';
import { apiClient } from '@/lib/api/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { 
  MoreVertical,
  ExternalLink,
  Copy,
  Download,
  Trash2,
  Archive,
  RefreshCw,
  Terminal,
  FileJson,
  Hash,
  AlertTriangle
} from 'lucide-react';

interface SessionActionsProps {
  session: Session;
  onDelete?: (sessionId: string) => void;
  onUpdate?: (session: Session) => void;
}

export function SessionActions({ session, onDelete, onUpdate }: SessionActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleView = () => {
    router.push(`/analysis/${session.session_id}`);
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(session.session_id);
    toast({
      title: 'SESSION_ID_COPIED',
      description: `${session.session_id.slice(0, 8)}... copied to clipboard`,
      className: 'bg-black border-green-900 text-green-500 font-mono text-xs',
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Fetch full session data
      const response = await apiClient.getSession(session.session_id);
      
      const exportData = {
        session_id: session.session_id,
        exported_at: new Date().toISOString(),
        metadata: response.metadata,
        state: response.state,
        events_count: response.events_count,
        variant_count: session.variant_count,
        pathogenic_count: session.pathogenic_count,
        vep_status: session.vep_status,
        clinical_summary: session.summary
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${session.session_id.slice(0, 8)}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'EXPORT_SUCCESS',
        description: 'Session data exported',
        className: 'bg-black border-green-900 text-green-500 font-mono text-xs',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'EXPORT_FAILED',
        description: 'Could not export session data',
        variant: 'destructive',
        className: 'bg-black border-red-900 text-red-500 font-mono text-xs',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRerun = () => {
    // Navigate to analysis page with VCF path pre-filled
    router.push(`/analysis/new?vcf=${encodeURIComponent(session.vcf_path || '')}`);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await apiClient.deleteSession(session.session_id);
      onDelete?.(session.session_id);
      toast({
        title: 'SESSION_DELETED',
        description: `${session.session_id.slice(0, 8)}... removed`,
        className: 'bg-black border-green-900 text-green-500 font-mono text-xs',
      });
    } catch (error) {
      console.error('Delete failed:', error);
      toast({
        title: 'DELETE_FAILED',
        description: 'Could not delete session',
        variant: 'destructive',
        className: 'bg-black border-red-900 text-red-500 font-mono text-xs',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const isRunning = session.status === 'processing' || session.status === 'analyzing';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-7 w-7 hover:bg-gray-900"
          >
            <MoreVertical className="h-3 w-3 text-gray-600" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className="bg-black border-gray-800 font-mono text-xs"
        >
          <DropdownMenuItem 
            onClick={handleView}
            className="hover:bg-gray-900 text-gray-400 hover:text-green-500 cursor-pointer"
          >
            <ExternalLink className="mr-2 h-3 w-3" />
            VIEW_SESSION
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={handleCopyId}
            className="hover:bg-gray-900 text-gray-400 hover:text-green-500 cursor-pointer"
          >
            <Copy className="mr-2 h-3 w-3" />
            COPY_ID
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={handleExport}
            disabled={isExporting}
            className="hover:bg-gray-900 text-gray-400 hover:text-green-500 cursor-pointer"
          >
            {isExporting ? (
              <>
                <Terminal className="mr-2 h-3 w-3 animate-pulse" />
                EXPORTING...
              </>
            ) : (
              <>
                <FileJson className="mr-2 h-3 w-3" />
                EXPORT_JSON
              </>
            )}
          </DropdownMenuItem>
          
          {session.vcf_path && (
            <DropdownMenuItem 
              onClick={handleRerun}
              disabled={isRunning}
              className="hover:bg-gray-900 text-gray-400 hover:text-green-500 cursor-pointer"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              RERUN_ANALYSIS
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator className="bg-gray-900" />
          
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            disabled={isRunning}
            className="hover:bg-gray-900 text-red-500 hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="mr-2 h-3 w-3" />
            DELETE
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-black border-red-900/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              CONFIRM_DELETE
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs text-gray-500">
              <div className="space-y-2">
                <p>This action will permanently delete:</p>
                <div className="bg-gray-950 p-2 rounded border border-gray-900">
                  <div className="text-green-500">SESSION_ID: {session.session_id}</div>
                  {session.variant_count && (
                    <div className="text-gray-600">VARIANTS: {session.variant_count.toLocaleString()}</div>
                  )}
                  {session.vcf_path && (
                    <div className="text-gray-600">FILE: {session.vcf_path.split('/').pop()}</div>
                  )}
                </div>
                <p className="text-red-500">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-black border-gray-800 hover:border-gray-700 text-gray-400 font-mono text-xs"
            >
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-950 hover:bg-red-900 text-red-400 font-mono text-xs"
            >
              {isDeleting ? 'DELETING...' : 'DELETE_SESSION'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}