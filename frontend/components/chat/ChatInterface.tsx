'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';
import { AnalysisState, Session, VEPTaskStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { 
  ArrowLeft,
  Download,
  FileText,
  Hash,
  Terminal,
  Activity,
  Cpu,
  Database,
  AlertTriangle,
  BarChart3,
  X
} from 'lucide-react';
import { Visualization } from '@/lib/types';
import { DetectedVisualization } from '@/lib/visualization/chartDetector';
import { VisualizationPanel } from '@/components/visualization/VisualizationPanel';

interface ChatInterfaceProps {
  analysisState: AnalysisState;
  session: Session | null;
  onSendMessage: (message: string, vcfPath?: string) => void;
  onVEPStatusUpdate?: (status: VEPTaskStatus) => void;
}

export function ChatInterface({
  analysisState,
  session,
  onSendMessage,
  onVEPStatusUpdate
}: ChatInterfaceProps) {
  const router = useRouter();
  const [showVCFSelector, setShowVCFSelector] = useState(false);
  const [selectedVCF, setSelectedVCF] = useState<string>('');
  const [systemMetrics, setSystemMetrics] = useState({
    messageCount: 0,
    processingTime: 0,
    memoryUsage: 45
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Visualization state
  const [showVisualizationPanel, setShowVisualizationPanel] = useState(false);
  const [activeVisualizations, setActiveVisualizations] = useState<DetectedVisualization[]>([]);
  const [pendingChartRequest, setPendingChartRequest] = useState<string | null>(null);

  useEffect(() => {
    if (analysisState.messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [analysisState.messages]);

  useEffect(() => {
    // Update metrics
    setSystemMetrics(prev => ({
      messageCount: analysisState.messages.length,
      processingTime: prev.processingTime + 1,
      memoryUsage: 45 + Math.random() * 20
    }));
  }, [analysisState.messages]);

  const handleVCFSelect = (path: string) => {
    setSelectedVCF(path);
    setShowVCFSelector(false);
  };

  const convertToVisualization = (detected: DetectedVisualization): Visualization => {
    return {
      id: detected.id,
      type: detected.type,
      title: detected.title || `${detected.type.charAt(0).toUpperCase() + detected.type.slice(1)} Chart`,
      data: detected.data,
      timestamp: detected.timestamp,
      metadata: detected.metadata
    };
  };

  // Handle visualization detection from messages
  const handleVisualizationDetected = (viz: DetectedVisualization) => {
    console.log('Adding visualization to state:', viz);
    setActiveVisualizations(prev => {
      // Check if visualization already exists
      const exists = prev.some(v => v.id === viz.id);
      if (exists) return prev;
      
      // Add new visualization
      const updated = [...prev, viz];
      
      // Auto-open panel if this is the first visualization
      if (updated.length === 1) {
        setShowVisualizationPanel(true);
      }
      
      return updated;
    });
    
    // Clear pending request if we got a chart
    setPendingChartRequest(null);
  };

  // Handle viewing a specific visualization
  const handleViewVisualization = (viz: DetectedVisualization) => {
    setShowVisualizationPanel(true);
  };

  // Handle removing a visualization
  const handleRemoveVisualization = (id: string) => {
    setActiveVisualizations(prev => prev.filter(v => v.id !== id));
    
    // Close panel if no visualizations left
    if (activeVisualizations.length <= 1) {
      setShowVisualizationPanel(false);
    }
  };

  // Handle chart-specific commands in messages
  const handleSendMessageWithChartDetection = (message: string, vcfPath?: string) => {
    const lowerMessage = message.toLowerCase();
    
    // Check for chart commands
    const chartCommands = [
      'show chart', 'show graph', 'create chart', 'make chart',
      'visualize', 'plot', 'show visualization', 'show visualizations',
      'open charts', 'view charts', 'clear charts', 'hide charts'
    ];
    
    if (chartCommands.some(cmd => lowerMessage.includes(cmd))) {
      if (lowerMessage.includes('clear') || lowerMessage.includes('hide')) {
        setActiveVisualizations([]);
        setShowVisualizationPanel(false);
      } else if (lowerMessage.includes('open') || lowerMessage.includes('view')) {
        if (activeVisualizations.length > 0) {
          setShowVisualizationPanel(true);
        }
      } else {
        // Mark that we're expecting a chart response
        setPendingChartRequest(message);
      }
    }
    
    // Forward to original handler
    onSendMessage(message, vcfPath);
  };

  const getVEPStatusDisplay = () => {
    if (!analysisState.vepStatus) return null;
    
    const { status, message } = analysisState.vepStatus;
    const statusColors: Record<string, string> = {
      pending: 'text-yellow-500',
      running: 'text-blue-500',
      completed: 'text-green-500',
      failed: 'text-red-500'
    };
    
    return (
      <div className="flex items-center gap-2 font-mono text-xs">
        <Cpu className={`h-3 w-3 ${statusColors[status] || 'text-gray-500'} ${status === 'running' ? 'animate-pulse' : ''}`} />
        <span className={statusColors[status] || 'text-gray-500'}>VEP_{status.toUpperCase()}</span>
        {analysisState.vepProgress !== undefined && status === 'running' && (
          <>
            <span className="text-gray-600">|</span>
            <span className="text-green-500">{analysisState.vepProgress}%</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-900 bg-black/90 backdrop-blur">
        <div className="container px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard')}
                className="hover:bg-gray-900 h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4 text-gray-600" />
              </Button>
              
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-green-500" />
                <div className="font-mono text-sm">
                  <span className="text-green-500">analysis</span>
                  <span className="text-gray-600">@</span>
                  <span className="text-gray-500">
                    {session?.session_id ? session.session_id.slice(0, 8) : 'new'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {getVEPStatusDisplay()}
              
              {/* Visualization indicator */}
              {activeVisualizations.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVisualizationPanel(!showVisualizationPanel)}
                  className="hover:bg-gray-900 font-mono text-xs"
                >
                  <BarChart3 className="h-3 w-3 mr-1 text-green-500" />
                  <span className="text-green-500">
                    CHARTS_{activeVisualizations.length}
                  </span>
                </Button>
              )}
              
              {session?.status && (
                <div className={`font-mono text-xs ${
                  session.status === 'completed' ? 'text-green-500' : 
                  session.status === 'error' ? 'text-red-500' : 
                  'text-blue-500'
                }`}>
                  STATUS_{session.status.toUpperCase()}
                </div>
              )}
              
              <Button 
                variant="ghost" 
                size="icon"
                className="hover:bg-gray-900 h-8 w-8"
              >
                <Download className="h-4 w-4 text-gray-600" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Info Bar */}
      {(session?.variant_count || session?.pathogenic_count !== undefined || activeVisualizations.length > 0) && (
        <div className="border-b border-gray-900 bg-black/50">
          <div className="container px-4 py-2">
            <div className="flex items-center gap-6 font-mono text-xs">
              {session?.vcf_path && (
                <div className="flex items-center gap-2 text-gray-600">
                  <FileText className="h-3 w-3" />
                  <span>FILE:</span>
                  <span className="text-green-500">
                    {session.vcf_path.split('/').pop()}
                  </span>
                </div>
              )}
              
              {session?.variant_count != null && (
                <div className="text-gray-600">
                  VARIANTS: <span className="text-gray-400">
                    {session.variant_count.toLocaleString()}
                  </span>
                </div>
              )}

              {session?.pathogenic_count !== null && session?.pathogenic_count !== undefined && (
                <div className="text-gray-600">
                  PATHOGENIC: <span className="text-red-500">
                    {session.pathogenic_count}
                  </span>
                </div>
              )}
              
              <div className="text-gray-600">
                MESSAGES: <span className="text-gray-400">
                  {systemMetrics.messageCount}
                </span>
              </div>
              
              {activeVisualizations.length > 0 && (
                <div className="text-gray-600">
                  CHARTS: <span className="text-green-400">
                    {activeVisualizations.length}
                  </span>
                </div>
              )}
              
              {pendingChartRequest && (
                <div className="text-gray-600">
                  <span className="text-yellow-500 animate-pulse">GENERATING_CHART...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden bg-black">
        <MessageList 
          messages={analysisState.messages}
          isStreaming={analysisState.isStreaming}
          onVisualizationDetected={handleVisualizationDetected}
          onViewVisualization={handleViewVisualization}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* VCF Selector Modal */}
      {showVCFSelector && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-black border-green-900/50 p-6 space-y-4">
            <h3 className="font-mono text-sm text-green-500">SELECT_VCF_FILE</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start border-gray-800 hover:border-green-900 font-mono text-xs"
                onClick={() => handleVCFSelect('gs://brain-genomics/test-data/sample.vcf')}
              >
                <FileText className="mr-2 h-3 w-3" />
                sample.vcf (DEMO)
              </Button>
              <div className="relative">
                <input
                  type="text"
                  placeholder="gs://bucket/path/to/file.vcf"
                  className="w-full px-3 py-2 bg-black border border-gray-800 rounded text-green-400 font-mono text-xs focus:border-green-900 focus:outline-none"
                  value={selectedVCF}
                  onChange={(e) => setSelectedVCF(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowVCFSelector(false)}
                className="flex-1 border-gray-800 hover:border-gray-700 font-mono text-xs"
              >
                CANCEL
              </Button>
              <Button
                onClick={() => handleVCFSelect(selectedVCF)}
                disabled={!selectedVCF}
                className="flex-1 bg-green-950 hover:bg-green-900 text-green-400 font-mono text-xs"
              >
                SELECT
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Visualization Panel */}
      <VisualizationPanel
        open={showVisualizationPanel}
        onClose={() => setShowVisualizationPanel(false)}
        visualizations={activeVisualizations.map(convertToVisualization)}
        onRemoveVisualization={handleRemoveVisualization}
        sessionId={session?.session_id}
        analysisMode={session?.status === 'analyzing' ? 'clinical' : 'research'}
      />

      {/* Input Bar */}
      <InputBar
        onSendMessage={handleSendMessageWithChartDetection}
        disabled={analysisState.isStreaming}
        vcfPath={selectedVCF}
        onVCFSelect={() => setShowVCFSelector(true)}
      />
    </div>
  );
}