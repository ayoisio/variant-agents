// components/analysis/VCFSelector.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  FileText,
  Upload,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Database,
  Terminal,
  Hash,
  HardDrive
} from 'lucide-react';

interface VCFSelectorProps {
  onSelect: (path: string) => void;
  onCancel?: () => void;
  currentPath?: string;
}

interface RecentFile {
  path: string;
  name: string;
  size?: number;
  lastUsed: Date;
  variantCount?: number;
}

export function VCFSelector({ onSelect, onCancel, currentPath }: VCFSelectorProps) {
  const [gcsPath, setGcsPath] = useState(currentPath || '');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [activeTab, setActiveTab] = useState<'input' | 'recent' | 'demo'>('input');

  useEffect(() => {
    const stored = localStorage.getItem('recentVCFFiles');
    if (stored) {
      try {
        const files = JSON.parse(stored);
        setRecentFiles(files.map((f: any) => ({
          ...f,
          lastUsed: new Date(f.lastUsed)
        })));
      } catch (e) {
        console.error('Failed to load recent files:', e);
      }
    }
  }, []);

  const demoFiles: RecentFile[] = [
    {
      path: 'gs://brain-genomics/test-data/NA12878.vcf.gz',
      name: 'NA12878.vcf.gz',
      size: 125000000,
      lastUsed: new Date(),
      variantCount: 3456789
    },
    {
      path: 'gs://brain-genomics/test-data/sample_variants.vcf',
      name: 'sample_variants.vcf',
      size: 45000000,
      lastUsed: new Date(),
      variantCount: 234567
    }
  ];

  const validatePath = async (path: string): Promise<boolean> => {
    if (!path.startsWith('gs://')) {
      setValidationError('ERROR: Path must start with gs://');
      return false;
    }

    const validExtensions = ['.vcf', '.vcf.gz', '.vcf.bgz'];
    const hasValidExtension = validExtensions.some(ext => path.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
      setValidationError('ERROR: Invalid file format. Expected: .vcf, .vcf.gz, .vcf.bgz');
      return false;
    }

    return true;
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationError(null);
    setValidationSuccess(false);

    try {
      const isValid = await validatePath(gcsPath);
      
      if (isValid) {
        setValidationSuccess(true);
        
        const newRecent: RecentFile = {
          path: gcsPath,
          name: gcsPath.split('/').pop() || 'Unknown',
          lastUsed: new Date()
        };
        
        const updated = [newRecent, ...recentFiles.filter(f => f.path !== gcsPath)].slice(0, 10);
        setRecentFiles(updated);
        localStorage.setItem('recentVCFFiles', JSON.stringify(updated));
        
        setTimeout(() => {
          onSelect(gcsPath);
        }, 500);
      }
    } catch (error) {
      setValidationError('ERROR: Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSelectFile = (file: RecentFile) => {
    const updated = [
      { ...file, lastUsed: new Date() },
      ...recentFiles.filter(f => f.path !== file.path)
    ];
    setRecentFiles(updated);
    localStorage.setItem('recentVCFFiles', JSON.stringify(updated));
    onSelect(file.path);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
  };

  return (
    <Card className="w-full max-w-2xl bg-black border-green-900/50">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-green-500" />
            <span className="font-mono text-sm text-green-500">VCF_FILE_SELECTOR</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-gray-900">
            <button
              onClick={() => setActiveTab('input')}
              className={`pb-2 font-mono text-xs ${
                activeTab === 'input' ? 'text-green-500 border-b border-green-500' : 'text-gray-600'
              }`}
            >
              MANUAL_INPUT
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`pb-2 font-mono text-xs ${
                activeTab === 'recent' ? 'text-green-500 border-b border-green-500' : 'text-gray-600'
              }`}
            >
              RECENT_FILES
            </button>
            <button
              onClick={() => setActiveTab('demo')}
              className={`pb-2 font-mono text-xs ${
                activeTab === 'demo' ? 'text-green-500 border-b border-green-500' : 'text-gray-600'
              }`}
            >
              DEMO_DATA
            </button>
          </div>

          {/* Content */}
          {activeTab === 'input' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="font-mono text-xs text-gray-500">GCS_PATH</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="gs://bucket-name/path/to/file.vcf"
                    value={gcsPath}
                    onChange={(e) => {
                      setGcsPath(e.target.value);
                      setValidationError(null);
                      setValidationSuccess(false);
                    }}
                    className="bg-black border-gray-800 text-green-400 font-mono text-sm focus:border-green-900"
                  />
                  <Button
                    onClick={handleValidate}
                    disabled={!gcsPath || isValidating}
                    className="bg-green-950 hover:bg-green-900 text-green-400 font-mono text-xs"
                  >
                    {isValidating ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        VALIDATING
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        VALIDATE
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {validationError && (
                <Alert className="bg-red-950/20 border-red-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="font-mono text-xs text-red-400">
                    {validationError}
                  </AlertDescription>
                </Alert>
              )}

              {validationSuccess && (
                <Alert className="bg-green-950/20 border-green-900">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription className="font-mono text-xs text-green-400">
                    VALIDATION_SUCCESS: File ready for processing
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {activeTab === 'recent' && (
            <div className="space-y-2">
              {recentFiles.length === 0 ? (
                <div className="text-center py-8 font-mono text-xs text-gray-600">
                  NO_RECENT_FILES
                </div>
              ) : (
                recentFiles.map((file, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectFile(file)}
                    className="w-full p-3 border border-gray-900 hover:border-green-900 rounded transition-colors text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3 w-3 text-gray-600" />
                          <span className="font-mono text-xs text-green-500">{file.name}</span>
                        </div>
                        <div className="font-mono text-xs text-gray-600">
                          {file.path}
                        </div>
                        <div className="flex gap-4 font-mono text-xs text-gray-700">
                          <span>{formatSize(file.size)}</span>
                          {file.variantCount && (
                            <span>{file.variantCount.toLocaleString()} variants</span>
                          )}
                        </div>
                      </div>
                      <Clock className="h-3 w-3 text-gray-700" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === 'demo' && (
            <div className="space-y-2">
              {demoFiles.map((file, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectFile(file)}
                  className="w-full p-3 border border-gray-900 hover:border-green-900 rounded transition-colors text-left"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Database className="h-3 w-3 text-blue-500" />
                      <span className="font-mono text-xs text-green-500">{file.name}</span>
                      <Badge variant="outline" className="border-blue-900 text-blue-500 text-xs">
                        DEMO
                      </Badge>
                    </div>
                    <div className="font-mono text-xs text-gray-600">
                      {file.path}
                    </div>
                    <div className="flex gap-4 font-mono text-xs text-gray-700">
                      <span>{formatSize(file.size)}</span>
                      <span>{file.variantCount?.toLocaleString()} variants</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-900">
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="border-gray-800 hover:border-gray-700 font-mono text-xs"
              >
                CANCEL
              </Button>
            )}
            <Button
              onClick={() => onSelect(gcsPath)}
              disabled={!gcsPath || isValidating}
              className="bg-green-950 hover:bg-green-900 text-green-400 font-mono text-xs"
            >
              <Upload className="mr-1 h-3 w-3" />
              SELECT_FILE
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}