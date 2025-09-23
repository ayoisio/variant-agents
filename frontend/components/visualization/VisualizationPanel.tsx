'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChartContainer } from './ChartContainer';
import { X, BarChart3, PieChart, TrendingUp, Grid3x3 } from 'lucide-react';

interface Visualization {
  id: string;
  type: string;
  title: string;
  data: any;
  timestamp: Date;
  metadata?: any;
}

interface VisualizationPanelProps {
  open: boolean;
  onClose: () => void;
  visualizations: Visualization[];
  onRemoveVisualization?: (id: string) => void;
  onRefreshVisualization?: (id: string) => void;
  sessionId?: string;
  analysisMode?: string;
}

export function VisualizationPanel({
  open,
  onClose,
  visualizations,
  onRemoveVisualization,
  onRefreshVisualization,
  sessionId,
  analysisMode = 'clinical'
}: VisualizationPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('');
  const [gridView, setGridView] = useState(false);

  // Set active tab when visualizations change
  useEffect(() => {
    if (visualizations.length > 0 && !activeTab) {
      setActiveTab(visualizations[0].id);
    }
  }, [visualizations, activeTab]);

  // Get icon for chart type
  const getChartIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'bar':
        return <BarChart3 className="h-4 w-4" />;
      case 'pie':
        return <PieChart className="h-4 w-4" />;
      case 'scatter':
      case 'line':
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <Grid3x3 className="h-4 w-4" />;
    }
  };

  // Empty state
  if (visualizations.length === 0) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Visualizations</SheetTitle>
            <SheetDescription>
              No visualizations yet. Ask me to create charts from your analysis data.
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-center h-[400px]">
            <div className="text-center space-y-4">
              <div className="flex justify-center gap-2">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
                <PieChart className="h-8 w-8 text-muted-foreground" />
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Try asking: "Show me a bar chart of top genes" or "Create a pie chart of clinical significance"
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Grid view for multiple charts
  if (gridView && visualizations.length > 1) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-6xl">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>Visualizations ({visualizations.length})</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGridView(false)}
                >
                  Tab View
                </Button>
                <Badge variant="outline">
                  {analysisMode === 'clinical' ? 'Clinical Mode' : 'Research Mode'}
                </Badge>
              </div>
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-8rem)] mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {visualizations.map((viz) => (
                <div key={viz.id} className="relative">
                  {onRemoveVisualization && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 z-10 h-6 w-6"
                      onClick={() => onRemoveVisualization(viz.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <ChartContainer
                    data={viz.data}
                    title={viz.title}
                    sessionId={sessionId}
                    analysisMode={analysisMode}
                    onRefresh={
                      onRefreshVisualization
                        ? () => onRefreshVisualization(viz.id)
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  // Tab view for single or multiple charts
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Visualizations</span>
            <div className="flex items-center gap-2">
              {visualizations.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGridView(true)}
                >
                  Grid View
                </Button>
              )}
              <Badge variant="outline">
                {analysisMode === 'clinical' ? 'Clinical Mode' : 'Research Mode'}
              </Badge>
            </div>
          </SheetTitle>
        </SheetHeader>

        {visualizations.length === 1 ? (
          // Single visualization - no tabs needed
          <div className="mt-6">
            <ChartContainer
              data={visualizations[0].data}
              title={visualizations[0].title}
              sessionId={sessionId}
              analysisMode={analysisMode}
              onRefresh={
                onRefreshVisualization
                  ? () => onRefreshVisualization(visualizations[0].id)
                  : undefined
              }
            />
          </div>
        ) : (
          // Multiple visualizations - use tabs
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className="grid w-full" style={{
              gridTemplateColumns: `repeat(${Math.min(visualizations.length, 4)}, 1fr)`
            }}>
              {visualizations.map((viz) => (
                <TabsTrigger
                  key={viz.id}
                  value={viz.id}
                  className="flex items-center gap-1"
                >
                  {getChartIcon(viz.type)}
                  <span className="truncate max-w-[100px]">
                    {viz.title || viz.type}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="h-[calc(100vh-12rem)]">
              {visualizations.map((viz) => (
                <TabsContent key={viz.id} value={viz.id} className="mt-4">
                  <div className="relative">
                    {onRemoveVisualization && visualizations.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 z-10 h-6 w-6"
                        onClick={() => {
                          onRemoveVisualization(viz.id);
                          // Switch to another tab if current is removed
                          if (viz.id === activeTab && visualizations.length > 1) {
                            const remaining = visualizations.filter(v => v.id !== viz.id);
                            if (remaining.length > 0) {
                              setActiveTab(remaining[0].id);
                            }
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <ChartContainer
                      data={viz.data}
                      title={viz.title}
                      subtitle={`Generated ${new Date(viz.timestamp).toLocaleString()}`}
                      sessionId={sessionId}
                      analysisMode={analysisMode}
                      onRefresh={
                        onRefreshVisualization
                          ? () => onRefreshVisualization(viz.id)
                          : undefined
                      }
                    />
                  </div>
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}