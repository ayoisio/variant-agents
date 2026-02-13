'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ChartData {
  type?: string;
  data?: any[];
  rows?: string[];
  columns?: string[];
  values?: number[][];
  [key: string]: any;
}

interface DynamicChartProps {
  data: ChartData | any[];
  chartType?: string;
  title?: string;
  height?: number;
  width?: number | `${number}%`;
  colorScheme?: string[];
}

export function DynamicChart({
  data,
  chartType,
  title,
  height = 300,
  width = '100%',
  colorScheme
}: DynamicChartProps) {
  // Default color schemes
  const defaultColors = [
    '#10b981', // emerald-500
    '#3b82f6', // blue-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
    '#f97316', // orange-500
  ];

  const colors = colorScheme || defaultColors;

  // Normalize data to always work with arrays
  const normalizedData = useMemo(() => {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  }, [data]);

  // Detect chart type from data structure or explicit type
  const detectedType = useMemo(() => {
    if (chartType) return chartType.toLowerCase();

    // Check if data is ChartData type
    if (!Array.isArray(data) && data && typeof data === 'object') {
      // Heatmap detection
      if (data.rows && data.columns && data.values) {
        return 'heatmap';
      }

      // Check for explicit type in data
      if (data.type) return data.type.toLowerCase();
    }

    // Scatter plot detection
    if (normalizedData.length > 0) {
      const firstItem = normalizedData[0];
      if (firstItem.x !== undefined && firstItem.y !== undefined) {
        return 'scatter';
      }
    }

    // Default to bar chart
    return 'bar';
  }, [data, chartType, normalizedData]);

  // Format percentage values
  const formatPercent = (value: number) => {
    if (value < 0.0001) return `${(value * 100).toExponential(1)}%`;
    if (value < 0.01) return `${(value * 100).toFixed(3)}%`;
    return `${(value * 100).toFixed(1)}%`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-3">
        <p className="font-semibold text-sm">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="text-xs mt-1">
            <span style={{ color: entry.color }}>{entry.name || 'Value'}: </span>
            <span className="font-mono font-semibold">
              {typeof entry.value === 'number' && entry.value < 0.001
                ? entry.value.toExponential(2)
                : entry.value?.toLocaleString()}
            </span>
            {entry.payload?.significance && (
              <div className="text-xs text-muted-foreground mt-1">
                Significance: {entry.payload.significance}
              </div>
            )}
            {entry.payload?.pathogenic !== undefined && (
              <div className="text-xs text-muted-foreground mt-1">
                Pathogenic: {entry.payload.pathogenic},
                Benign: {entry.payload.benign},
                VUS: {entry.payload.vus}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Check if this is population frequency data (from compare_populations_tool)
  const isPopulationData = useMemo(() => {
    return normalizedData.length > 0 && normalizedData[0]?.shortName !== undefined;
  }, [normalizedData]);

  // Render population frequency bar chart (horizontal, with NOT_DETECTED labels)
  const renderPopulationBarChart = () => {
    if (!normalizedData || normalizedData.length === 0) {
      return <div>No data available</div>;
    }

    // Sort by value descending so highest frequency is at top
    const sorted = [...normalizedData].sort((a, b) => (b.value || 0) - (a.value || 0));
    const maxValue = Math.max(...sorted.map((d: any) => d.value || 0));
    const globalAF = sorted[0]?.global_af;
    const significance = sorted[0]?.significance;
    const variantId = sorted[0]?.variant_id;

    return (
      <div className="w-full space-y-3">
        {/* Header info */}
        {(variantId || significance) && (
          <div className="flex items-center justify-between px-1">
            <div className="font-mono text-xs">
              {variantId && (
                <span className="text-cyan-400">VARIANT: <span className="text-white">{variantId}</span></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {significance && (
                <Badge variant="outline" className="text-xs border-red-800 text-red-400">
                  {significance}
                </Badge>
              )}
            </div>
          </div>
        )}
        {globalAF !== undefined && globalAF !== null && (
          <div className="font-mono text-xs text-gray-500 px-1">
            GLOBAL_AF: <span className="text-gray-300">{formatPercent(globalAF)}</span>
          </div>
        )}

        {/* Horizontal bars */}
        <div className="space-y-2">
          {sorted.map((entry: any, index: number) => {
            const isDetected = entry.value > 0;
            const barWidth = isDetected && maxValue > 0
              ? Math.max((entry.value / maxValue) * 100, 2)
              : 0;

            return (
              <div key={entry.shortName || index} className="flex items-center gap-3">
                {/* Population label */}
                <div className="w-36 flex-shrink-0">
                  <div className="font-mono text-xs text-gray-300 truncate">{entry.name}</div>
                  <div className="font-mono text-[10px] text-gray-600">{entry.shortName}</div>
                </div>

                {/* Bar */}
                <div className="flex-1 relative">
                  <div className="h-7 bg-gray-900 rounded overflow-hidden border border-gray-800">
                    {isDetected ? (
                      <div
                        className="h-full rounded transition-all duration-500"
                        style={{
                          width: `${barWidth}%`,
                          background: `linear-gradient(90deg, #0d9488 0%, #3b82f6 100%)`,
                        }}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <span className="font-mono text-[10px] text-gray-600">NOT_DETECTED</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Value label */}
                <div className="w-20 text-right font-mono text-xs flex-shrink-0">
                  {isDetected ? (
                    <span className="text-gray-300">{formatPercent(entry.value)}</span>
                  ) : (
                    <span className="text-gray-700">0%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render standard vertical bar chart
  const renderBarChart = () => {
    // Use population chart if data has population fields
    if (isPopulationData) {
      return renderPopulationBarChart();
    }

    if (!normalizedData || normalizedData.length === 0) {
      return <div>No data available</div>;
    }

    return (
      <ResponsiveContainer width={width} height={height}>
        <BarChart data={normalizedData} margin={{ top: 20, right: 30, left: 40, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={100}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar
            dataKey="value"
            fill={colors[0]}
            radius={[4, 4, 0, 0]}
          >
            {normalizedData.map((entry: any, index: number) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Render pie chart
  const renderPieChart = () => {
    if (!normalizedData || normalizedData.length === 0) {
      return <div>No data available</div>;
    }

    const RADIAN = Math.PI / 180;
    const renderCustomizedLabel = ({
      cx, cy, midAngle, innerRadius, outerRadius, percent, index, name
    }: any) => {
      if (percent < 0.05) return null; // Don't show labels for small slices

      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);

      return (
        <text
          x={x}
          y={y}
          fill="white"
          textAnchor={x > cx ? 'start' : 'end'}
          dominantBaseline="central"
          className="text-xs font-semibold"
        >
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      );
    };

    return (
      <ResponsiveContainer width={width} height={height}>
        <PieChart>
          <Pie
            data={normalizedData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={100}
            fill={colors[0]}
            dataKey="value"
          >
            {normalizedData.map((entry: any, index: number) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  // Render scatter plot
  const renderScatterChart = () => {
    if (!normalizedData || normalizedData.length === 0) {
      return <div>No data available</div>;
    }

    return (
      <ResponsiveContainer width={width} height={height}>
        <ScatterChart margin={{ top: 20, right: 30, left: 40, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="x"
            name="Frequency (log10)"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            dataKey="y"
            name="Clinical Significance"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            domain={[0, 4]}
            ticks={[0, 1, 2, 3, 4]}
            tickFormatter={(value) => {
              const labels = ['Benign', 'Likely Benign', 'VUS', 'Likely Path', 'Pathogenic'];
              return labels[Math.round(value)];
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter
            name="Variants"
            data={normalizedData}
            fill={colors[0]}
          >
            {normalizedData.map((entry: any, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.significance?.includes('pathogenic') ? colors[3] : colors[0]}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  };

  // Render heatmap
  const renderHeatmap = () => {
    // Extract heatmap structure — handle both direct and wrapped data
    let heatmapData: any = data;
    if (heatmapData && !Array.isArray(heatmapData) && typeof heatmapData === 'object') {
      const inner = (heatmapData as Record<string, any>).data;
      if (inner && !Array.isArray(inner) && inner.rows) {
        heatmapData = inner;
      }
    }

    // Type guard
    if (!heatmapData || Array.isArray(heatmapData)) {
      return <div className="text-gray-500 font-mono text-xs p-4">Invalid heatmap data format</div>;
    }

    const { rows, columns, values } = heatmapData as {
      rows?: string[];
      columns?: string[];
      values?: number[][]
    };

    if (!rows || !columns || !values || values.length === 0) {
      return <div className="text-gray-500 font-mono text-xs p-4">Missing heatmap data</div>;
    }

    const allValues = values.flat();
    const maxValue = Math.max(...allValues);
    const minValue = Math.min(...allValues);
    const range = maxValue - minValue || 1;

    const getColor = (value: number) => {
      const normalized = (value - minValue) / range;
      // Gradient from dark teal (low) to bright emerald (high)
      const r = Math.floor(13 + (16 - 13) * normalized);
      const g = Math.floor(148 + (185 - 148) * (1 - normalized));
      const b = Math.floor(136 + (129 - 136) * normalized);
      const opacity = 0.3 + normalized * 0.7;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    return (
      <div className="w-full overflow-auto">
        <div className="inline-block min-w-full">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-800 bg-gray-950 p-2 text-xs font-medium text-gray-400 sticky left-0">Variant</th>
                {columns.map((col: string) => (
                  <th key={col} className="border border-gray-800 bg-gray-950 p-2 text-xs font-medium text-gray-400">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: string, i: number) => (
                <tr key={row}>
                  <td className="border border-gray-800 bg-gray-950 p-2 text-xs font-medium text-gray-300 sticky left-0 whitespace-nowrap">
                    {row}
                  </td>
                  {values[i].map((value: number, j: number) => (
                    <td
                      key={j}
                      className="border border-gray-800 p-2 text-xs text-center font-mono"
                      style={{ backgroundColor: getColor(value), color: value > (maxValue * 0.6) ? '#fff' : '#9ca3af' }}
                      title={`${rows[i]} | ${columns[j]}: ${value.toFixed(2)}`}
                    >
                      {value >= 6 ? 'N/A' : value.toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-gray-600 font-mono">
            Scale: -log10(AF) · Higher values = rarer variants · N/A = not detected
          </div>
        </div>
      </div>
    );
  };

  // Render histogram (using bar chart)
  const renderHistogram = () => {
    if (!normalizedData || normalizedData.length === 0) {
      return <div>No data available</div>;
    }

    return (
      <ResponsiveContainer width={width} height={height}>
        <BarChart data={normalizedData} margin={{ top: 20, right: 30, left: 40, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={120}
            tick={{ fontSize: 10 }}
            className="text-muted-foreground"
          />
          <YAxis
            label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="value"
            fill={colors[2]}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Main render logic
  const renderChart = () => {
    switch (detectedType) {
      case 'bar':
        return renderBarChart();
      case 'pie':
        return renderPieChart();
      case 'scatter':
        return renderScatterChart();
      case 'heatmap':
        return renderHeatmap();
      case 'histogram':
        return renderHistogram();
      default:
        return renderBarChart();
    }
  };

  return (
    <div className="w-full">
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Badge variant="outline" className="text-xs">
            {detectedType.toUpperCase()}
          </Badge>
        </div>
      )}
      {renderChart()}
    </div>
  );
}