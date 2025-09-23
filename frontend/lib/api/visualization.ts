/**
 * API client for visualization endpoints with caching
 */

import React from 'react'; // Add React import for the hook

export interface VisualizationRequest {
  sessionId: string;
  chartType: 'bar' | 'pie' | 'histogram' | 'heatmap' | 'scatter' | 'line';
  dimension?: string;
  limit?: number;
  filters?: Record<string, any>;
}

export interface VisualizationResponse {
  status: string;
  session_id: string;
  chart_type: string;
  dimension?: string;
  analysis_mode: string;
  data: any;
  metadata: {
    total_annotations: number;
    total_variants_analyzed: number;
    data_points: number;
    generated_at?: string;
    context?: string;
  };
}

export interface PopulationComparisonRequest {
  sessionId: string;
  gene?: string;
  populations?: string[];
  significanceFilter?: string;
  limit?: number;
}

export interface CategoryFilterRequest {
  sessionId: string;
  category: 'cancer' | 'cardiovascular' | 'metabolic' | 'other';
  includeFrequencies?: boolean;
}

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50; // Maximum number of cached responses

class VisualizationCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  /**
   * Generate cache key from request parameters
   */
  private getCacheKey(params: Record<string, any>): string {
    return JSON.stringify(params);
  }

  /**
   * Get cached data if valid
   */
  get(params: Record<string, any>): any | null {
    const key = this.getCacheKey(params);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  /**
 * Set cache data
 */
set(params: Record<string, any>, data: any): void {
  // Enforce cache size limit
  if (this.cache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }
  
  const key = this.getCacheKey(params);
  this.cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

  /**
   * Clear cache for specific session or all
   */
  clear(sessionId?: string): void {
    if (!sessionId) {
      this.cache.clear();
      return;
    }
    
    // Clear cache entries for specific session
    for (const [key, _] of this.cache) {
      const params = JSON.parse(key);
      if (params.sessionId === sessionId) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      ttl: CACHE_TTL
    };
  }
}

// Singleton cache instance
const cache = new VisualizationCache();

// Get the API base URL from environment or use default
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export class VisualizationAPI {
  /**
   * Get visualization data for a specific chart type
   */
  static async getVisualization(
    request: VisualizationRequest
  ): Promise<VisualizationResponse> {
    // Check cache first
    const cachedData = cache.get(request);
    if (cachedData) {
      console.log('Returning cached visualization data');
      return cachedData;
    }
    
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (request.dimension) params.append('dimension', request.dimension);
      if (request.limit) params.append('limit', request.limit.toString());
      
      // Get auth token from localStorage (or wherever you store it)
      const token = localStorage.getItem('firebaseToken');
      
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      // Make API request
      const response = await fetch(
        `${API_BASE_URL}/sessions/${request.sessionId}/visualization/${request.chartType}?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Visualization request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Transform response if needed
      const transformedData = this.transformVisualizationResponse(data);
      
      // Cache the response
      cache.set(request, transformedData);
      
      return transformedData;
      
    } catch (error) {
      console.error('Failed to fetch visualization:', error);
      throw error;
    }
  }

  /**
   * Get multiple visualizations in parallel
   */
  static async getBatchVisualizations(
    requests: VisualizationRequest[]
  ): Promise<VisualizationResponse[]> {
    const promises = requests.map(req => this.getVisualization(req));
    return Promise.all(promises);
  }

  /**
   * Compare population frequencies
   */
  static async comparePopulations(
    request: PopulationComparisonRequest
  ): Promise<any> {
    const cacheKey = { type: 'population_comparison', ...request };
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    try {
      // This would call a specific endpoint or use the agent
      // For now, we'll use the general visualization endpoint
      const vizRequest: VisualizationRequest = {
        sessionId: request.sessionId,
        chartType: 'heatmap',
        dimension: 'population',
        filters: {
          gene: request.gene,
          populations: request.populations,
          significance: request.significanceFilter
        },
        limit: request.limit
      };
      
      const response = await this.getVisualization(vizRequest);
      cache.set(cacheKey, response);
      return response;
      
    } catch (error) {
      console.error('Failed to compare populations:', error);
      throw error;
    }
  }

  /**
   * Filter by disease category
   */
  static async filterByCategory(
    request: CategoryFilterRequest
  ): Promise<any> {
    const cacheKey = { type: 'category_filter', ...request };
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    try {
      const vizRequest: VisualizationRequest = {
        sessionId: request.sessionId,
        chartType: 'bar',
        dimension: 'category',
        filters: {
          category: request.category,
          includeFrequencies: request.includeFrequencies
        }
      };
      
      const response = await this.getVisualization(vizRequest);
      cache.set(cacheKey, response);
      return response;
      
    } catch (error) {
      console.error('Failed to filter by category:', error);
      throw error;
    }
  }

  /**
   * Transform visualization response for frontend consumption
   */
  private static transformVisualizationResponse(
    response: any
  ): VisualizationResponse {
    // Handle different response formats
    if (response.status === 'success') {
      return response;
    }
    
    // Transform legacy format if needed
    if (response.data && !response.status) {
      return {
        status: 'success',
        session_id: response.session_id || '',
        chart_type: response.chart_type || 'bar',
        dimension: response.dimension,
        analysis_mode: response.analysis_mode || 'clinical',
        data: response.data,
        metadata: response.metadata || {
          total_annotations: 0,
          total_variants_analyzed: 0,
          data_points: Array.isArray(response.data) ? response.data.length : 0,
          generated_at: undefined,
          context: undefined
        }
      };
    }
    
    return response;
  }

  /**
   * Prefetch common visualizations for a session
   */
  static async prefetchCommonVisualizations(sessionId: string): Promise<void> {
    const commonRequests: VisualizationRequest[] = [
      { sessionId, chartType: 'bar', dimension: 'gene', limit: 20 },
      { sessionId, chartType: 'pie', dimension: 'significance' },
      { sessionId, chartType: 'bar', dimension: 'chromosome' }
    ];
    
    // Fire and forget - don't wait for results
    this.getBatchVisualizations(commonRequests).catch(error => {
      console.warn('Failed to prefetch visualizations:', error);
    });
  }

  /**
   * Clear cache for a session
   */
  static clearCache(sessionId?: string): void {
    cache.clear(sessionId);
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; maxSize: number; ttl: number } {
    return cache.getStats();
  }
}

// Export singleton instance for direct use
export const visualizationAPI = VisualizationAPI;

// Hook for React components
export function useVisualization(request: VisualizationRequest | null) {
  const [data, setData] = React.useState<VisualizationResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  
  React.useEffect(() => {
    if (!request) return;
    
    let cancelled = false;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await VisualizationAPI.getVisualization(request);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      cancelled = true;
    };
  }, [request?.sessionId, request?.chartType, request?.dimension]);
  
  return { data, loading, error };
}