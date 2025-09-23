// components/session/SessionList.tsx
'use client';

import { useState, useEffect } from 'react';
import { Session, SessionFilters } from '@/lib/types';
import { SessionCard } from './SessionCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search,
  Filter,
  RefreshCw,
  Database,
  Terminal,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';

interface SessionListProps {
  sessions: Session[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onDelete?: (sessionId: string) => void;
  onUpdate?: (session: Session) => void;
  pageSize?: number;
}

export function SessionList({
  sessions,
  loading = false,
  error = null,
  onRefresh,
  onDelete,
  onUpdate,
  pageSize = 10
}: SessionListProps) {
  const [filteredSessions, setFilteredSessions] = useState<Session[]>(sessions);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'created' | 'updated' | 'variants'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    let filtered = [...sessions];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s =>
        s.session_id.toLowerCase().includes(term) ||
        s.vcf_path?.toLowerCase().includes(term) ||
        s.title.toLowerCase().includes(term) ||
        s.summary?.toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortBy) {
        case 'created':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'updated':
          aVal = new Date(a.updated_at).getTime();
          bVal = new Date(b.updated_at).getTime();
          break;
        case 'variants':
          aVal = a.variant_count || 0;
          bVal = b.variant_count || 0;
          break;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredSessions(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [sessions, searchTerm, statusFilter, sortBy, sortOrder]);

  const totalPages = Math.ceil(filteredSessions.length / pageSize);
  const paginatedSessions = filteredSessions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getStatusCounts = () => {
    const counts: Record<string, number> = {};
    sessions.forEach(s => {
      counts[s.status] = (counts[s.status] || 0) + 1;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <Terminal className="h-8 w-8 text-green-500 mx-auto animate-pulse" />
          <p className="font-mono text-xs text-gray-600">LOADING_SESSIONS...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-black border-red-900/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div className="font-mono text-xs">
              <p className="text-red-500">ERROR_LOADING_SESSIONS</p>
              <p className="text-gray-600 mt-1">{error}</p>
            </div>
          </div>
          {onRefresh && (
            <Button
              onClick={onRefresh}
              variant="outline"
              size="sm"
              className="mt-4 border-gray-800 hover:border-green-900 font-mono text-xs"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              RETRY
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="bg-black border-gray-900">
        <CardContent className="p-12 text-center">
          <Database className="h-12 w-12 text-gray-800 mx-auto mb-4" />
          <h3 className="font-mono text-sm text-gray-500 mb-2">NO_SESSIONS_FOUND</h3>
          <p className="font-mono text-xs text-gray-600">
            Start a new analysis to create your first session
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <Card className="bg-black border-gray-900">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-600" />
              <Input
                placeholder="grep -E 'session_id|vcf_path|summary'"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-black border-gray-800 text-green-400 font-mono text-xs pl-8 h-8 focus:border-green-900"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-black border-gray-800 font-mono text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-gray-800">
                <SelectItem value="all" className="font-mono text-xs">
                  ALL_STATUS ({sessions.length})
                </SelectItem>
                {Object.entries(statusCounts).map(([status, count]) => (
                  <SelectItem key={status} value={status} className="font-mono text-xs">
                    {status.toUpperCase()} ({count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-32 bg-black border-gray-800 font-mono text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-gray-800">
                <SelectItem value="created" className="font-mono text-xs">CREATED</SelectItem>
                <SelectItem value="updated" className="font-mono text-xs">UPDATED</SelectItem>
                <SelectItem value="variants" className="font-mono text-xs">VARIANTS</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Order */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="border-gray-800 hover:border-green-900 font-mono text-xs h-8"
            >
              {sortOrder === 'desc' ? '↓ DESC' : '↑ ASC'}
            </Button>

            {/* Refresh */}
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="border-gray-800 hover:border-green-900 font-mono text-xs h-8"
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                REFRESH
              </Button>
            )}
          </div>

          {/* Active Filters */}
          {(searchTerm || statusFilter !== 'all') && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-900">
              <span className="font-mono text-xs text-gray-600">FILTERS:</span>
              {searchTerm && (
                <Badge variant="outline" className="border-gray-800 text-gray-500 font-mono text-xs">
                  SEARCH: {searchTerm}
                </Badge>
              )}
              {statusFilter !== 'all' && (
                <Badge variant="outline" className="border-gray-800 text-gray-500 font-mono text-xs">
                  STATUS: {statusFilter.toUpperCase()}
                </Badge>
              )}
              <span className="font-mono text-xs text-gray-600 ml-2">
                FOUND: {filteredSessions.length}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Cards */}
      <div className="space-y-2">
        {paginatedSessions.map((session) => (
          <SessionCard
            key={session.session_id}
            session={session}
            onDelete={onDelete}
            onUpdate={onUpdate}
            isSelected={selectedSessionId === session.session_id}
            onSelect={setSelectedSessionId}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="bg-black border-gray-900">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-600">
                PAGE {currentPage}/{totalPages} | SHOWING {paginatedSessions.length}/{filteredSessions.length}
              </span>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="border-gray-800 hover:border-green-900 font-mono text-xs h-7"
                >
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  PREV
                </Button>
                
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={i}
                        variant={pageNum === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`font-mono text-xs h-7 w-7 ${
                          pageNum === currentPage 
                            ? 'bg-green-950 text-green-400 border-green-900' 
                            : 'border-gray-800 hover:border-green-900'
                        }`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="border-gray-800 hover:border-green-900 font-mono text-xs h-7"
                >
                  NEXT
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}