// components/analysis/ClinicalReport.tsx
'use client';

import { useState } from 'react';
import { ClinicalAssessment } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Download,
  FileJson,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Hash,
  Terminal,
  FileText,
  Activity,
  Copy,
  Check
} from 'lucide-react';

interface ClinicalReportProps {
  assessment: ClinicalAssessment;
  sessionId: string;
  patientId?: string;
  generatedAt: Date;
  variantCount?: number;
  pathogenicCount?: number;
}

export function ClinicalReport({
  assessment,
  sessionId,
  patientId,
  generatedAt,
  variantCount,
  pathogenicCount
}: ClinicalReportProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    findings: true,
    recommendations: false,
    raw: false
  });
  const [copied, setCopied] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleExportJSON = () => {
    const reportData = {
      session_id: sessionId,
      patient_id: patientId,
      generated_at: generatedAt.toISOString(),
      variant_count: variantCount,
      pathogenic_count: pathogenicCount,
      assessment
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${sessionId.slice(0, 8)}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyReport = () => {
    const reportText = `
CLINICAL GENOMICS REPORT
========================
SESSION: ${sessionId}
GENERATED: ${generatedAt.toISOString()}
VARIANTS: ${variantCount || 0}
PATHOGENIC: ${pathogenicCount || 0}

SUMMARY
-------
${assessment.summary || 'No summary available'}

KEY FINDINGS
------------
${Array.isArray(assessment.key_findings) 
  ? assessment.key_findings.join('\n') 
  : assessment.key_findings || 'None identified'}

RECOMMENDATIONS
---------------
${Array.isArray(assessment.recommendations)
  ? assessment.recommendations.join('\n')
  : assessment.recommendations || 'Standard clinical management'}
    `.trim();

    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const recommendations = Array.isArray(assessment.recommendations) 
    ? assessment.recommendations 
    : [assessment.recommendations].filter(Boolean);
    
  const keyFindings = Array.isArray(assessment.key_findings)
    ? assessment.key_findings
    : [assessment.key_findings].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-black border-green-900/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-green-500" />
                <h2 className="font-mono text-sm text-green-500">
                  CLINICAL_ASSESSMENT_COMPLETE
                </h2>
              </div>
              <div className="font-mono text-xs text-gray-600 space-y-1">
                <div>SESSION_ID: {sessionId.slice(0, 16)}...</div>
                <div>TIMESTAMP: {generatedAt.toISOString()}</div>
                {patientId && <div>PATIENT_ID: {patientId}</div>}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReport}
                className="border-gray-800 hover:border-green-900 font-mono text-xs"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3 text-green-500" />
                    COPIED
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    COPY
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                className="border-gray-800 hover:border-green-900 font-mono text-xs"
              >
                <FileJson className="mr-1 h-3 w-3" />
                EXPORT
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex gap-6 mt-4 pt-3 border-t border-gray-900 font-mono text-xs">
            <div className="text-gray-600">
              TOTAL_VARIANTS: <span className="text-gray-400">{variantCount?.toLocaleString() || 0}</span>
            </div>
            <div className="text-gray-600">
              PATHOGENIC: <span className="text-red-500">{pathogenicCount || 0}</span>
            </div>
            <div className="text-gray-600">
              RISK_LEVEL: <span className={pathogenicCount && pathogenicCount > 0 ? 'text-yellow-500' : 'text-green-500'}>
                {pathogenicCount && pathogenicCount > 0 ? 'ELEVATED' : 'NORMAL'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Summary */}
      <Card className="bg-black border-gray-900">
        <CardContent className="p-4">
          <button
            onClick={() => toggleSection('summary')}
            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              {expandedSections.summary ? (
                <ChevronDown className="h-3 w-3 text-gray-600" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-600" />
              )}
              <Hash className="h-3 w-3 text-green-500" />
              <span className="font-mono text-xs text-green-500">CLINICAL_SUMMARY</span>
            </div>
          </button>
          
          {expandedSections.summary && (
            <div className="mt-3 font-mono text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
              {assessment.summary || 'No summary data available.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Findings */}
      <Card className="bg-black border-gray-900">
        <CardContent className="p-4">
          <button
            onClick={() => toggleSection('findings')}
            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              {expandedSections.findings ? (
                <ChevronDown className="h-3 w-3 text-gray-600" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-600" />
              )}
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
              <span className="font-mono text-xs text-yellow-500">KEY_FINDINGS</span>
              {keyFindings.length > 0 && (
                <Badge variant="outline" className="border-yellow-900 text-yellow-500 text-xs ml-2">
                  {keyFindings.length}
                </Badge>
              )}
            </div>
          </button>
          
          {expandedSections.findings && (
            <div className="mt-3 space-y-2">
              {keyFindings.length > 0 ? (
                keyFindings.map((finding, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="font-mono text-xs text-yellow-600">[{index + 1}]</span>
                    <span className="font-mono text-xs text-gray-400">{finding}</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-xs text-gray-600">
                  No critical findings identified
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card className="bg-black border-gray-900">
        <CardContent className="p-4">
          <button
            onClick={() => toggleSection('recommendations')}
            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              {expandedSections.recommendations ? (
                <ChevronDown className="h-3 w-3 text-gray-600" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-600" />
              )}
              <Activity className="h-3 w-3 text-blue-500" />
              <span className="font-mono text-xs text-blue-500">CLINICAL_RECOMMENDATIONS</span>
            </div>
          </button>
          
          {expandedSections.recommendations && (
            <div className="mt-3 space-y-2">
              {recommendations.length > 0 ? (
                recommendations.map((rec, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="font-mono text-xs text-blue-600">→</span>
                    <span className="font-mono text-xs text-gray-400">{rec}</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-xs text-gray-600">
                  Continue standard clinical management
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw Data */}
      <Card className="bg-black border-gray-900">
        <CardContent className="p-4">
          <button
            onClick={() => toggleSection('raw')}
            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              {expandedSections.raw ? (
                <ChevronDown className="h-3 w-3 text-gray-600" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-600" />
              )}
              <FileText className="h-3 w-3 text-gray-500" />
              <span className="font-mono text-xs text-gray-500">RAW_ASSESSMENT_DATA</span>
            </div>
          </button>
          
          {expandedSections.raw && (
            <pre className="mt-3 font-mono text-xs text-gray-600 overflow-x-auto">
              {JSON.stringify(assessment, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Alert className="bg-black border-gray-800">
        <Terminal className="h-4 w-4" />
        <AlertDescription className="font-mono text-xs text-gray-600">
          [NOTICE] Research use only. Not for clinical diagnosis. 
          All findings require validation by qualified personnel.
        </AlertDescription>
      </Alert>
    </div>
  );
}