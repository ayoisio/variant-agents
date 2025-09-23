'use client';

import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Download,
  Maximize2,
  RefreshCw,
  Copy,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { DynamicChart } from './DynamicChart';

interface ChartContainerProps {
  data: any;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  sessionId?: string;
  analysisMode?: string;
}

export function ChartContainer({
  data,
  title,
  subtitle,
  loading = false,
  error,
  onRefresh,
  sessionId,
  analysisMode = 'clinical'
}: ChartContainerProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedData, setCopiedData] = useState(false);

  // Export as PNG
  const exportAsPNG = async () => {
    if (!chartRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });

      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, `chart_${sessionId || 'export'}_${Date.now()}.png`);
        }
      });
    } catch (err) {
      console.error('Failed to export chart:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export as SVG (simplified - would need actual SVG extraction)
  const exportAsSVG = () => {
    const svgElement = chartRef.current?.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    saveAs(blob, `chart_${sessionId || 'export'}_${Date.now()}.svg`);
  };

  // Export as CSV
  const exportAsCSV = () => {
    if (!data || !Array.isArray(data.data)) return;

    const csvContent = convertToCSV(data.data);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    saveAs(blob, `data_${sessionId || 'export'}_${Date.now()}.csv`);
  };

  // Convert data to CSV format
  const convertToCSV = (dataArray: any[]) => {
    if (!dataArray || dataArray.length === 0) return '';

    const headers = Object.keys(dataArray[0]);
    const csvHeaders = headers.join(',');

    const csvRows = dataArray.map(row => {
      return headers.map(header => {
        const value = row[header];
        // Escape values containing commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  };

  // Copy data to clipboard
  const copyDataToClipboard = () => {
    const jsonData = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonData);
    setCopiedData(true);
    setTimeout(() => setCopiedData(false), 2000);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      chartRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          {subtitle && <Skeleton className="h-4 w-64 mt-2" />}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="mt-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Empty data state
  if (!data || (Array.isArray(data.data) && data.data.length === 0)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">No data available for visualization</p>
            {analysisMode === 'clinical' && (
              <p className="text-xs text-muted-foreground mt-2">
                Clinical mode only includes ACMG genes
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isFullscreen ? 'fixed inset-0 z-50 m-0 rounded-none' : ''}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            {title && <CardTitle>{title}</CardTitle>}
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                disabled={isExporting}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportAsPNG}>
                  Export as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportAsSVG}>
                  Export as SVG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportAsCSV}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyDataToClipboard}>
                  <Copy className="h-4 w-4 mr-2" />
                  {copiedData ? 'Copied!' : 'Copy JSON Data'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div ref={chartRef} className="w-full">
          <DynamicChart
            data={data}
            height={isFullscreen ? window.innerHeight - 150 : 300}
          />
        </div>

        {data.metadata && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {data.metadata.total_annotations && (
                <span>Total Annotations: {data.metadata.total_annotations.toLocaleString()}</span>
              )}
              {data.metadata.data_points && (
                <span>Data Points: {data.metadata.data_points}</span>
              )}
              {data.metadata.context && (
                <span>{data.metadata.context}</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}