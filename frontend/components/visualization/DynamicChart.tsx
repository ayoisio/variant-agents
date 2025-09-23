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
  width?: string | number;
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
            {entry.payload.pathogenic !== undefined && (
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

  // Render bar chart
  const renderBarChart = () => {
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
    // Type guard to ensure we have the heatmap data structure
    if (!data || Array.isArray(data)) {
      return <div>Invalid heatmap data</div>;
    }
    
    const { rows, columns, values } = data as { 
      rows?: string[]; 
      columns?: string[]; 
      values?: number[][] 
    };
    
    if (!rows || !columns || !values) {
      return <div>Missing heatmap data</div>;
    }

    const maxValue = Math.max(...values.flat());
    const minValue = Math.min(...values.flat());

    const getColor = (value: number) => {
      const normalized = (value - minValue) / (maxValue - minValue);
      const intensity = Math.floor(255 * (1 - normalized));
      return `rgb(${intensity}, ${255 - intensity/2}, ${intensity})`;
    };

    return (
      <div className="w-full overflow-auto">
        <div className="inline-block min-w-full">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="border border-border p-2 text-xs font-medium">Gene</th>
                {columns.map((col: string) => (
                  <th key={col} className="border border-border p-2 text-xs font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: string, i: number) => (
                <tr key={row}>
                  <td className="border border-border p-2 text-xs font-medium">
                    {row}
                  </td>
                  {values[i].map((value: number, j: number) => (
                    <td
                      key={j}
                      className="border border-border p-2 text-xs text-center"
                      style={{ backgroundColor: getColor(value) }}
                      title={`${value.toFixed(2)}`}
                    >
                      {value > 4 ? '>4' : value.toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted-foreground">
            Scale: -log10(AF) - Higher values indicate rarer variants
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