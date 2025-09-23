'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api/client';
import { Session, SessionFilters, PaginationOptions } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  MoreVertical,
  Trash2,
  ExternalLink,
  RefreshCw,
  Grid3x3,
  List,
  Calendar,
  Dna,
  LogOut,
  User,
  Check,
  X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

function DashboardContent() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const isMountedRef = useRef(true);

  // State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pagination, setPagination] = useState<PaginationOptions>({
    limit: 12,
    offset: 0,
    total: 0
  });
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Track if component is mounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel any pending requests on unmount
      apiClient.cancelRequest('sessions-list');
    };
  }, []);

  // Fetch sessions
  const fetchSessions = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);

    try {
      const response = await apiClient.listSessions(pagination.limit, pagination.offset);

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setSessions(response.sessions);
        setPagination(prev => ({ ...prev, total: response.count }));
      }
    } catch (err: any) {
      // Don't set error for abort/timeout
      if (isMountedRef.current && err.name !== 'AbortError' && err.name !== 'TimeoutError') {
        console.error('Failed to fetch sessions:', err);
        setError('Failed to load sessions. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, [pagination.offset]);

  // Refresh handler
  const handleRefresh = () => {
    setRefreshing(true);
    fetchSessions(false);
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;

    setDeletingId(sessionId);
    try {
      await apiClient.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError('Failed to delete session');
    } finally {
      setDeletingId(null);
    }
  };

  // Navigate to session
  const handleOpenSession = (sessionId: string) => {
    router.push(`/analysis/${sessionId}`);
  };

  // Create new analysis
  const handleNewAnalysis = () => {
    router.push('/analysis/new');
  };

  // Handle logout
  const handleLogout = async () => {
      setLoggingOut(true);
      try {
        await signOut();
        router.push('/');
      } catch (error) {
        console.error('Logout failed:', error);
        setError('Failed to logout. Please try again.');
        setLoggingOut(false);
      }
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = searchTerm === '' ||
      session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.vcf_path?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Get status badge
  const getStatusBadge = (status: Session['status']) => {
    const statusConfig = {
      active: { icon: Clock, variant: 'secondary' as const, label: 'Active' },
      processing: { icon: Loader2, variant: 'default' as const, label: 'Processing' },
      analyzing: { icon: Loader2, variant: 'default' as const, label: 'Analyzing' },
      completed: { icon: CheckCircle, variant: 'success' as const, label: 'Completed' },
      error: { icon: XCircle, variant: 'destructive' as const, label: 'Error' }
    };

    const config = statusConfig[status] || statusConfig.active;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  // Generate initials from user name/email
  const getUserInitials = () => {
    if (user?.displayName) {
      return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  // Session card component
  const SessionCard = ({ session }: { session: Session }) => {
    const isDeleting = deletingId === session.session_id;
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState(session.title);
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveTitle = async () => {
      if (editedTitle.trim() === session.title) {
        setIsEditing(false);
        return;
      }

      setIsSaving(true);
      try {
        await apiClient.updateSessionMetadata(session.session_id, { title: editedTitle.trim() });

        // Update local state
        setSessions(prev => prev.map(s =>
          s.session_id === session.session_id
            ? { ...s, title: editedTitle.trim() }
            : s
        ));

        setIsEditing(false);
      } catch (error) {
        console.error('Failed to update title:', error);
        setEditedTitle(session.title); // Reset on error
      } finally {
        setIsSaving(false);
      }
    };

    const handleCancelEdit = () => {
      setEditedTitle(session.title);
      setIsEditing(false);
    };

    return (
      <Card className="genomic-card group hover:shadow-glow-md transition-all duration-300">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 mr-2">
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="h-7 text-sm"
                    autoFocus
                    disabled={isSaving}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={handleSaveTitle}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <CardTitle
                  className="text-base line-clamp-1 cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditing(true)}
                >
                  {session.title}
                </CardTitle>
              )}
              <CardDescription className="text-xs">
                {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenSession(session.session_id)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDeleteSession(session.session_id)}
                  className="text-destructive"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            {getStatusBadge(session.status)}
            {session.vep_status && (
              <Badge variant="outline" className="text-xs">
                VEP: {session.vep_status}
              </Badge>
            )}
          </div>

          {session.vcf_path && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span className="truncate">{session.vcf_path.split('/').pop()}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <div className="text-xs">
              <span className="text-muted-foreground">Variants:</span>
              <span className="ml-1 font-medium">
                {session.variant_count !== null && session.variant_count !== undefined
                  ? session.variant_count.toLocaleString()
                  : '—'}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Pathogenic:</span>
              <span className="ml-1 font-medium text-destructive">
                {session.pathogenic_count !== null && session.pathogenic_count !== undefined
                  ? session.pathogenic_count.toLocaleString()
                  : '—'}
              </span>
            </div>
          </div>

          <Button
            className="w-full"
            size="sm"
            onClick={() => handleOpenSession(session.session_id)}
          >
            Continue Analysis
            <ExternalLink className="ml-2 h-3 w-3" />
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Dna className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Welcome back, {user?.displayName || user?.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleNewAnalysis} className="gap-2">
                <Plus className="h-4 w-4" />
                New Analysis
              </Button>

              {/* User Avatar Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 p-0 rounded-full overflow-hidden border border-primary/20 hover:border-primary/40"
                  >
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt="Profile"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-medium bg-primary/10 text-primary">
                        {getUserInitials()}
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      {user?.displayName && (
                        <p className="text-sm font-medium">{user.displayName}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="text-destructive focus:text-destructive"
                  >
                    {loggingOut ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="mr-2 h-4 w-4" />
                    )}
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <div className="container px-4 py-8">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <div className="flex rounded-lg border">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Sessions Grid/List */}
        {loading ? (
          <div className={viewMode === 'grid' ?
            'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' :
            'space-y-4'
          }>
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="genomic-card">
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card className="genomic-card">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sessions found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Start your first analysis to see it here'}
              </p>
              <Button onClick={handleNewAnalysis}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Analysis
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === 'grid' ?
            'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' :
            'space-y-4'
          }>
            {filteredSessions.map((session) => (
              <SessionCard key={session.session_id} session={session} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.total && pagination.total > pagination.limit && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
              disabled={pagination.offset === 0}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(p => ({ ...p, offset: p.offset + p.limit }))}
              disabled={pagination.offset + pagination.limit >= pagination.total}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}