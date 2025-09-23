// components/analysis/VariantTable.tsx
'use client';

import { useState, useMemo } from 'react';
import { Variant } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Database,
  Hash,
  Filter
} from 'lucide-react';

interface VariantTableProps {
  variants: Variant[];
  title?: string;
  showFilters?: boolean;
  pageSize?: number;
}

type SortField = 'position' | 'gene' | 'impact' | 'significance';
type SortDirection = 'asc' | 'desc';

export function VariantTable({
  variants,
  title = 'VARIANT_ANALYSIS_RESULTS',
  showFilters = true,
  pageSize = 25
}: VariantTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('position');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const processedVariants = useMemo(() => {
    let filtered = [...variants];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.gene?.toLowerCase().includes(term) ||
        v.variant_id.toLowerCase().includes(term) ||
        v.chromosome.toLowerCase().includes(term)
      );
    }
    
    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      // Map sortField to actual variant properties
      if (sortField === 'significance') {
        aVal = a.clinical_significance;
        bVal = b.clinical_significance;
      } else if (sortField === 'position') {
        aVal = a.position;
        bVal = b.position;
      } else if (sortField === 'gene') {
        aVal = a.gene;
        bVal = b.gene;
      } else if (sortField === 'impact') {
        aVal = a.impact;
        bVal = b.impact;
      }
      
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal?.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  }, [variants, searchTerm, sortField, sortDirection]);

  const totalPages = Math.ceil(processedVariants.length / pageSize);
  const paginatedVariants = processedVariants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    const csv = [
      ['variant_id', 'chr', 'pos', 'ref', 'alt', 'gene', 'impact', 'significance'],
      ...processedVariants.map(v => [
        v.variant_id,
        v.chromosome,
        v.position,
        v.reference,
        v.alternate,
        v.gene || '',
        v.impact || '',
        v.clinical_significance || ''
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `variants_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getImpactColor = (impact?: string) => {
    if (!impact) return 'text-gray-600';
    switch (impact.toLowerCase()) {
      case 'high': return 'text-red-500';
      case 'moderate': return 'text-yellow-500';
      case 'low': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const getSignificanceDisplay = (sig?: string) => {
    if (!sig) return { text: 'UNKNOWN', color: 'text-gray-600' };
    const lower = sig.toLowerCase();
    if (lower.includes('pathogenic')) return { text: 'PATHOGENIC', color: 'text-red-500' };
    if (lower.includes('benign')) return { text: 'BENIGN', color: 'text-green-500' };
    return { text: 'VUS', color: 'text-yellow-500' };
  };

  return (
    <Card className="bg-black border-gray-900">
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-green-500" />
              <span className="font-mono text-xs text-green-500">{title}</span>
              <Badge variant="outline" className="border-gray-800 text-gray-500 text-xs">
                {processedVariants.length}
              </Badge>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="border-gray-800 hover:border-green-900 font-mono text-xs"
            >
              <Download className="mr-1 h-3 w-3" />
              EXPORT_CSV
            </Button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-600" />
              <Input
                placeholder="grep 'gene | variant_id | chr'"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-black border-gray-800 text-green-400 font-mono text-xs pl-8 h-8 focus:border-green-900"
              />
            </div>
          )}

          {/* Table */}
          <div className="border border-gray-900 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead className="bg-gray-950 border-b border-gray-900">
                  <tr>
                    <th className="text-left p-2 text-gray-500">#</th>
                    <th className="text-left p-2 text-gray-500">VARIANT</th>
                    <th 
                      className="text-left p-2 text-gray-500 cursor-pointer hover:text-green-500"
                      onClick={() => handleSort('gene')}
                    >
                      <div className="flex items-center gap-1">
                        GENE
                        {sortField === 'gene' && (
                          sortDirection === 'asc' ? 
                            <ChevronUp className="h-3 w-3" /> : 
                            <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-left p-2 text-gray-500 cursor-pointer hover:text-green-500"
                      onClick={() => handleSort('impact')}
                    >
                      <div className="flex items-center gap-1">
                        IMPACT
                        {sortField === 'impact' && (
                          sortDirection === 'asc' ? 
                            <ChevronUp className="h-3 w-3" /> : 
                            <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-left p-2 text-gray-500 cursor-pointer hover:text-green-500"
                      onClick={() => handleSort('significance')}
                    >
                      <div className="flex items-center gap-1">
                        SIGNIFICANCE
                        {sortField === 'significance' && (
                          sortDirection === 'asc' ? 
                            <ChevronUp className="h-3 w-3" /> : 
                            <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVariants.map((variant, index) => {
                    const sig = getSignificanceDisplay(variant.clinical_significance);
                    return (
                      <tr 
                        key={index}
                        className={`border-b border-gray-900 hover:bg-gray-950 cursor-pointer ${
                          selectedVariant === variant.variant_id ? 'bg-gray-950' : ''
                        }`}
                        onClick={() => setSelectedVariant(
                          selectedVariant === variant.variant_id ? null : variant.variant_id
                        )}
                      >
                        <td className="p-2 text-gray-600">
                          {(currentPage - 1) * pageSize + index + 1}
                        </td>
                        <td className="p-2 text-green-600">
                          {`${variant.chromosome}:${variant.position} ${variant.reference}>${variant.alternate}`}
                        </td>
                        <td className="p-2 text-gray-400">
                          {variant.gene || '—'}
                        </td>
                        <td className={`p-2 ${getImpactColor(variant.impact)}`}>
                          {variant.impact?.toUpperCase() || '—'}
                        </td>
                        <td className={`p-2 ${sig.color}`}>
                          {sig.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-600">
                PAGE {currentPage}/{totalPages} | SHOWING {paginatedVariants.length}/{processedVariants.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="border-gray-800 hover:border-green-900 font-mono text-xs h-7"
                >
                  PREV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="border-gray-800 hover:border-green-900 font-mono text-xs h-7"
                >
                  NEXT
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}