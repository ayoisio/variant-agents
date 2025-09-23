/**
 * Chart themes and configuration presets matching terminal aesthetic
 */

export interface ChartTheme {
  name: string;
  colors: {
    primary: readonly string[];
    secondary: readonly string[];
    background: string;
    text: string;
    grid: string;
    axis: string;
  };
  fonts: {
    base: string;
    mono: string;
  };
}

// Terminal-inspired color palettes
export const CHART_THEMES = {
  terminal: {
    name: 'Terminal',
    colors: {
      primary: [
        '#10b981', // emerald-500
        '#3b82f6', // blue-500
        '#f59e0b', // amber-500
        '#ef4444', // red-500
        '#8b5cf6', // violet-500
        '#ec4899', // pink-500
        '#14b8a6', // teal-500
        '#f97316', // orange-500
      ] as const,
      secondary: [
        '#34d399', // emerald-400
        '#60a5fa', // blue-400
        '#fbbf24', // amber-400
        '#f87171', // red-400
        '#a78bfa', // violet-400
        '#f472b6', // pink-400
        '#2dd4bf', // teal-400
        '#fb923c', // orange-400
      ] as const,
      background: '#0a0a0a',
      text: '#e5e7eb',
      grid: '#374151',
      axis: '#6b7280'
    },
    fonts: {
      base: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace'
    }
  },
  
  clinical: {
    name: 'Clinical',
    colors: {
      primary: [
        '#0ea5e9', // sky-500
        '#06b6d4', // cyan-500
        '#10b981', // emerald-500
        '#3b82f6', // blue-500
        '#6366f1', // indigo-500
        '#8b5cf6', // violet-500
        '#0891b2', // cyan-600
        '#0284c7', // sky-600
      ] as const,
      secondary: [
        '#38bdf8', // sky-400
        '#22d3ee', // cyan-400
        '#34d399', // emerald-400
        '#60a5fa', // blue-400
        '#818cf8', // indigo-400
        '#a78bfa', // violet-400
        '#06b6d4', // cyan-500
        '#0ea5e9', // sky-500
      ] as const,
      background: '#ffffff',
      text: '#1f2937',
      grid: '#e5e7eb',
      axis: '#6b7280'
    },
    fonts: {
      base: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: '"JetBrains Mono", "Fira Code", monospace'
    }
  },
  
  research: {
    name: 'Research',
    colors: {
      primary: [
        '#7c3aed', // violet-600
        '#2563eb', // blue-600
        '#dc2626', // red-600
        '#ea580c', // orange-600
        '#16a34a', // green-600
        '#0891b2', // cyan-600
        '#9333ea', // purple-600
        '#e11d48', // rose-600
      ] as const,
      secondary: [
        '#8b5cf6', // violet-500
        '#3b82f6', // blue-500
        '#ef4444', // red-500
        '#f97316', // orange-500
        '#22c55e', // green-500
        '#06b6d4', // cyan-500
        '#a855f7', // purple-500
        '#f43f5e', // rose-500
      ] as const,
      background: '#fafafa',
      text: '#111827',
      grid: '#d1d5db',
      axis: '#4b5563'
    },
    fonts: {
      base: '"Source Sans Pro", "Segoe UI", Roboto, sans-serif',
      mono: '"Source Code Pro", "Cascadia Code", monospace'
    }
  }
};

export type ThemeName = keyof typeof CHART_THEMES;

/**
 * Chart size configurations
 */
export const CHART_SIZES = {
  small: {
    width: 400,
    height: 250,
    margin: { top: 10, right: 20, bottom: 40, left: 40 }
  },
  medium: {
    width: 600,
    height: 350,
    margin: { top: 20, right: 30, bottom: 50, left: 50 }
  },
  large: {
    width: 800,
    height: 450,
    margin: { top: 20, right: 40, bottom: 60, left: 60 }
  },
  full: {
    width: '100%' as const,
    height: 500,
    margin: { top: 20, right: 40, bottom: 80, left: 60 }
  }
};

export type SizeName = keyof typeof CHART_SIZES;

/**
 * Get theme by name or analysis mode
 */
export function getChartTheme(
  nameOrMode: ThemeName | 'clinical' | 'research' | 'terminal' = 'terminal'
): ChartTheme {
  return CHART_THEMES[nameOrMode as ThemeName] || CHART_THEMES.terminal;
}

/**
 * Get responsive chart dimensions
 */
export function getResponsiveChartSize(
  containerWidth: number,
  aspectRatio: number = 16 / 9
): { width: number | string; height: number } {
  if (containerWidth < 500) {
    return { width: '100%', height: 250 };
  } else if (containerWidth < 768) {
    return { width: '100%', height: 350 };
  } else if (containerWidth < 1024) {
    return { width: '100%', height: 400 };
  } else {
    return { width: '100%', height: 450 };
  }
}

/**
 * Chart configuration presets
 */
export const CHART_CONFIGS = {
  bar: {
    barCategoryGap: '20%',
    barGap: 4,
    radius: [4, 4, 0, 0] as const,
    maxBarSize: 50
  },
  
  pie: {
    innerRadius: 0,
    outerRadius: '80%',
    paddingAngle: 2,
    startAngle: 90,
    endAngle: 450
  },
  
  scatter: {
    symbolSize: 8,
    symbolType: 'circle' as const,
    opacity: 0.8
  },
  
  line: {
    strokeWidth: 2,
    dot: true,
    dotSize: 4,
    activeDotSize: 6,
    animationDuration: 1000
  }
};

/**
 * Format numbers for chart display
 */
export function formatChartNumber(value: number, type?: string): string {
  if (type === 'percentage') {
    if (value < 0.0001) return `${(value * 100).toExponential(1)}%`;
    if (value < 0.01) return `${(value * 100).toFixed(3)}%`;
    return `${(value * 100).toFixed(1)}%`;
  }
  
  if (type === 'frequency') {
    if (value < 0.0001) return value.toExponential(2);
    if (value < 0.01) return value.toFixed(4);
    return value.toFixed(3);
  }
  
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  
  return value.toLocaleString();
}

/**
 * Generate color scale for heatmap
 */
export function generateHeatmapColorScale(
  min: number,
  max: number,
  theme: ThemeName = 'terminal'
): (value: number) => string {
  const themeColors = CHART_THEMES[theme].colors;
  
  return (value: number) => {
    const normalized = (value - min) / (max - min);
    
    // Use gradient from theme colors
    if (normalized < 0.25) {
      return themeColors.primary[2]; // green
    } else if (normalized < 0.5) {
      return themeColors.primary[1]; // yellow
    } else if (normalized < 0.75) {
      return themeColors.primary[0]; // orange
    } else {
      return themeColors.primary[3]; // red
    }
  };
}

/**
 * Get axis configuration for different data types
 */
export function getAxisConfig(dataType: string, theme: ChartTheme) {
  const baseConfig = {
    tick: { fill: theme.colors.axis, fontSize: 11 },
    axisLine: { stroke: theme.colors.grid },
    grid: { stroke: theme.colors.grid, strokeDasharray: '3 3' }
  };
  
  switch (dataType) {
    case 'chromosome':
      return {
        ...baseConfig,
        angle: -45,
        textAnchor: 'end' as const,
        height: 100
      };
      
    case 'gene':
      return {
        ...baseConfig,
        angle: -45,
        textAnchor: 'end' as const,
        height: 120,
        interval: 0
      };
      
    case 'frequency':
      return {
        ...baseConfig,
        tickFormatter: (v: number) => formatChartNumber(v, 'frequency'),
        domain: [0, 'dataMax' as const]
      };
      
    case 'percentage':
      return {
        ...baseConfig,
        tickFormatter: (v: number) => formatChartNumber(v, 'percentage'),
        domain: [0, 1] as const
      };
      
    default:
      return baseConfig;
  }
}

/**
 * Get tooltip configuration
 */
export function getTooltipConfig(theme: ChartTheme) {
  return {
    contentStyle: {
      backgroundColor: theme.colors.background + 'f5',
      border: `1px solid ${theme.colors.grid}`,
      borderRadius: '8px',
      padding: '8px 12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      fontSize: '12px',
      fontFamily: theme.fonts.mono
    },
    labelStyle: {
      color: theme.colors.text,
      fontWeight: 600,
      marginBottom: '4px'
    },
    itemStyle: {
      color: theme.colors.text,
      fontSize: '11px'
    }
  };
}

/**
 * Get legend configuration
 */
export function getLegendConfig(theme: ChartTheme, position: 'top' | 'bottom' | 'right' = 'bottom') {
  return {
    wrapperStyle: {
      paddingTop: position === 'bottom' ? '20px' : '0',
      fontSize: '12px',
      fontFamily: theme.fonts.base
    },
    iconType: 'rect' as const,
    iconSize: 12,
    itemGap: 15,
    formatter: (value: string) => {
      // Truncate long labels
      return value.length > 20 ? value.substring(0, 20) + '...' : value;
    }
  };
}

/**
 * Export theme for use in components
 */
export function exportThemeStyles(theme: ChartTheme): string {
  return `
    .chart-container {
      background-color: ${theme.colors.background};
      color: ${theme.colors.text};
      font-family: ${theme.fonts.base};
    }
    
    .chart-title {
      color: ${theme.colors.text};
      font-family: ${theme.fonts.base};
      font-weight: 600;
    }
    
    .chart-subtitle {
      color: ${theme.colors.axis};
      font-family: ${theme.fonts.base};
      font-size: 0.9em;
    }
    
    .chart-value {
      font-family: ${theme.fonts.mono};
      color: ${theme.colors.primary[0]};
    }
  `;
}