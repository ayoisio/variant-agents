/**
 * Chart detection and parsing utilities for SSE messages and agent responses
 */

import { SSEEvent, SSEMessage } from '@/lib/types';

export interface DetectedVisualization {
  id: string;
  type: 'bar' | 'pie' | 'histogram' | 'heatmap' | 'scatter' | 'line';
  title?: string;
  data: any;
  dimension?: string;
  metadata?: {
    analysisMode?: string;
    totalAnnotations?: number;
    dataPoints?: number;
    context?: string;
    filters?: any;
  };
  timestamp: Date;
  source: 'tool_response' | 'message_content' | 'api_direct';
}

export class ChartDetector {
  /**
   * Detect visualization data in SSE enhanced events
   */
  static detectInSSEEvent(event: any): DetectedVisualization | null {
    try {
      // Check if event contains tool function response
      if (event?.event) {
        const parsedEvent = typeof event.event === 'string' 
          ? JSON.parse(event.event) 
          : event.event;
        
        // Check for visualization tool responses
        if (parsedEvent?.content?.parts) {
          for (const part of parsedEvent.content.parts) {
            // Look for function responses from visualization tools
            if (part.function_response?.name?.includes('chart') || 
                part.function_response?.name?.includes('visualization') ||
                part.function_response?.name === 'generate_chart_data_tool' ||
                part.function_response?.name === 'compare_populations_tool' ||
                part.function_response?.name === 'filter_by_category_tool') {
              
              const response = part.function_response.response;
              const parsedResponse = typeof response === 'string' 
                ? JSON.parse(response) 
                : response;
              
              if (parsedResponse?.status === 'success' && parsedResponse?.data) {
                return this.parseVisualizationResponse(parsedResponse, part.function_response.name);
              }
            }
          }
        }
      }

      // Check metadata for visualization hints
      if (event?.metadata?.visualization) {
        return this.parseVisualizationFromMetadata(event.metadata.visualization);
      }

    } catch (error) {
      console.error('Error detecting visualization in SSE event:', error);
    }

    return null;
  }

  /**
   * Parse agent text responses for chart requests
   */
  static detectChartIntent(text: string): {
    detected: boolean;
    chartType?: string;
    dimension?: string;
    filters?: any;
  } {
    const lowerText = text.toLowerCase();
    
    // Chart type patterns
    const chartPatterns = {
      bar: /\b(bar\s*chart|bar\s*graph|histogram)\b/i,
      pie: /\b(pie\s*chart|pie\s*graph|donut)\b/i,
      scatter: /\b(scatter\s*plot|scatter\s*chart|correlation)\b/i,
      heatmap: /\b(heat\s*map|matrix|grid)\b/i,
      line: /\b(line\s*chart|line\s*graph|trend)\b/i,
    };

    // Dimension patterns
    const dimensionPatterns = {
      gene: /\b(gene|genes|genetic)\b/i,
      chromosome: /\b(chromosome|chromosomes|chr)\b/i,
      significance: /\b(significance|pathogenic|clinical)\b/i,
      population: /\b(population|populations|ancestry|ethnic)\b/i,
      frequency: /\b(frequency|frequencies|allele|af)\b/i,
      category: /\b(category|categories|acmg|disease)\b/i,
    };

    let detected = false;
    let chartType: string | undefined;
    let dimension: string | undefined;

    // Detect chart type
    for (const [type, pattern] of Object.entries(chartPatterns)) {
      if (pattern.test(lowerText)) {
        detected = true;
        chartType = type;
        break;
      }
    }

    // Detect dimension
    for (const [dim, pattern] of Object.entries(dimensionPatterns)) {
      if (pattern.test(lowerText)) {
        dimension = dim;
        break;
      }
    }

    // General visualization keywords
    const vizKeywords = /\b(show|display|visualize|plot|graph|chart|create|generate|make)\b.*\b(chart|graph|plot|visualization|distribution|breakdown)\b/i;
    if (!detected && vizKeywords.test(lowerText)) {
      detected = true;
    }

    return { detected, chartType, dimension };
  }

  /**
   * Parse visualization response from tool
   */
  private static parseVisualizationResponse(
    response: any, 
    toolName: string
  ): DetectedVisualization {
    const id = `viz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine chart type
    let chartType = response.chart_type || 'bar';
    if (toolName === 'compare_populations_tool') {
      chartType = 'heatmap';
    } else if (response.comparison_type === 'population_frequencies') {
      chartType = 'bar';
    }

    // Extract title
    let title = response.title;
    if (!title) {
      if (response.dimension) {
        title = `${this.formatDimension(response.dimension)} Distribution`;
      } else if (response.category) {
        title = `${response.category} Category Analysis`;
      } else if (response.gene) {
        title = `${response.gene} Variant Analysis`;
      } else {
        title = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`;
      }
    }

    return {
      id,
      type: chartType as any,
      title,
      data: response.data || response,
      dimension: response.dimension,
      metadata: response.metadata || {
        analysisMode: response.analysis_mode,
        totalAnnotations: response.total_annotations,
        dataPoints: response.data?.length,
        context: response.context,
        filters: response.filters
      },
      timestamp: new Date(),
      source: 'tool_response'
    };
  }

  /**
   * Parse visualization from metadata
   */
  private static parseVisualizationFromMetadata(vizData: any): DetectedVisualization {
    return {
      id: vizData.id || `viz_${Date.now()}`,
      type: vizData.type || this.inferChartType(vizData.data),
      title: vizData.title,
      data: vizData.data,
      dimension: vizData.dimension,
      metadata: vizData.metadata,
      timestamp: new Date(vizData.timestamp || Date.now()),
      source: 'message_content'
    };
  }

  /**
   * Infer chart type from data structure
   */
  static inferChartType(data: any): DetectedVisualization['type'] {
    if (!data) return 'bar';

    // Check for heatmap structure
    if (data.rows && data.columns && data.values) {
      return 'heatmap';
    }

    // Check for scatter plot structure
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].x !== undefined && data[0].y !== undefined) {
        return 'scatter';
      }
    }

    // Check data array for patterns
    if (Array.isArray(data.data || data)) {
      const items = data.data || data;
      if (items.length > 0) {
        const first = items[0];
        
        // If data points have frequency ranges, it's likely a histogram
        if (first.range_start !== undefined || first.range_end !== undefined) {
          return 'histogram';
        }
        
        // If we have a small number of items with percentages, likely a pie chart
        if (items.length <= 8 && first.percentage !== undefined) {
          return 'pie';
        }
        
        // Check for significance data (often shown as pie)
        if (first.name?.toLowerCase().includes('pathogenic') || 
            first.name?.toLowerCase().includes('benign')) {
          return 'pie';
        }
      }
    }

    // Default to bar chart
    return 'bar';
  }

  /**
   * Format dimension names for display
   */
  private static formatDimension(dimension: string): string {
    const formats: Record<string, string> = {
      gene: 'Gene',
      chromosome: 'Chromosome',
      significance: 'Clinical Significance',
      population: 'Population',
      frequency: 'Allele Frequency',
      category: 'Disease Category',
      impact: 'Variant Impact'
    };
    return formats[dimension] || dimension;
  }

  /**
   * Extract all visualizations from conversation messages
   */
  static extractVisualizationsFromMessages(messages: SSEMessage[]): DetectedVisualization[] {
    const visualizations: DetectedVisualization[] = [];
    
    for (const message of messages) {
      // Check if the message contains visualization data in its event
      const viz = this.detectInSSEEvent(message);
      if (viz) {
        visualizations.push(viz);
      }
      
      // Also check the raw event if different from the wrapped message
      if (message.event) {
        const eventViz = this.detectInSSEEvent({ event: message.event });
        if (eventViz && eventViz.id !== viz?.id) {
          visualizations.push(eventViz);
        }
      }
    }
    
    return visualizations;
  }

  /**
   * Check if data contains population comparison
   */
  static isPopulationComparison(data: any): boolean {
    if (!data) return false;
    
    // Check for population comparison structure
    if (data.comparison_type === 'population_frequencies') {
      return true;
    }
    
    // Check for population data in array items
    if (Array.isArray(data.data || data)) {
      const items = data.data || data;
      if (items.length > 0 && items[0].populations) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Validate visualization data
   */
  static validateVisualizationData(viz: DetectedVisualization): boolean {
    if (!viz.data) return false;
    
    // Check for valid data structure based on type
    switch (viz.type) {
      case 'heatmap':
        return !!(viz.data.rows && viz.data.columns && viz.data.values);
      
      case 'scatter':
        const scatterData = viz.data.data || viz.data;
        return Array.isArray(scatterData) && 
               scatterData.length > 0 && 
               scatterData[0].x !== undefined;
      
      case 'bar':
      case 'pie':
      case 'histogram':
      case 'line':
        const chartData = viz.data.data || viz.data;
        return Array.isArray(chartData) && chartData.length > 0;
      
      default:
        return false;
    }
  }
}