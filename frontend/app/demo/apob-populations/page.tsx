'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TypeWriter } from '@/components/demo/TypeWriter';
import { StreamingMessage } from '@/components/demo/StreamingMessage';
import { PopulationHeatmap } from '@/components/demo/PopulationHeatmap';
import { DemoControls } from '@/components/demo/DemoControls';
import { User, Terminal, BarChart3, Globe } from 'lucide-react';

export default function ApobPopulationsDemo() {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const userQuery = "Compare APOB across ethnic populations";
  
  const introResponse = `Analyzing population frequencies for the **APOB** pathogenic variant (\`2:21006087:C>T\`) across 8 ancestries using **gnomAD BigQuery** public datasets...`;

  const populationData = [
    { name: 'Other', code: 'OTH', frequency: 0.09225, color: '#10b981' },
    { name: 'Non-Finnish European', code: 'NFE', frequency: 0.00649, color: '#3b82f6' },
    { name: 'African/African American', code: 'AFR', frequency: 0, color: '#8b5cf6' },
    { name: 'Latino/Admixed American', code: 'AMR', frequency: 0, color: '#f59e0b' },
    { name: 'Ashkenazi Jewish', code: 'ASJ', frequency: 0, color: '#ec4899' },
    { name: 'East Asian', code: 'EAS', frequency: 0, color: '#14b8a6' },
    { name: 'Finnish', code: 'FIN', frequency: 0, color: '#f97316' },
    { name: 'South Asian', code: 'SAS', frequency: 0, color: '#6366f1' },
  ];

  useEffect(() => {
    if (isPlaying) {
      if (step === 0) {
        const timeout = setTimeout(() => setStep(1), userQuery.length * 50 + 500);
        return () => clearTimeout(timeout);
      } else if (step === 1) {
        const timeout = setTimeout(() => setStep(2), introResponse.length * 30 + 1000);
        return () => clearTimeout(timeout);
      }
    }
  }, [isPlaying, step]);

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleRestart = () => {
    setStep(0);
    setIsPlaying(false);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-gray-900 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal className="h-5 w-5 text-green-500" />
              <div className="font-mono text-sm">
                <span className="text-green-500">analysis</span>
                <span className="text-gray-600">@</span>
                <span className="text-gray-500">demo_session</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="border-cyan-900 text-cyan-500 font-mono text-xs">
                <Globe className="h-3 w-3 mr-1" />
                GNOMAD_BIGQUERY
              </Badge>
              <Badge variant="outline" className="border-green-900 text-green-500 font-mono text-xs">
                CLINICAL_MODE
              </Badge>
            </div>
          </div>
        </div>

        {/* Info bar */}
        <div className="border border-gray-900 rounded-lg p-3 bg-gray-950/50">
          <div className="flex items-center gap-6 font-mono text-xs">
            <div className="text-gray-600">
              GENE: <span className="text-green-500">APOB</span>
            </div>
            
            <div className="text-gray-600">
              VARIANT: <span className="text-gray-400">2:21006087:C{'>'}T</span>
            </div>
            
            {step >= 2 && (
              <>
                <div className="text-gray-600 animate-in fade-in duration-500">
                  POPULATIONS: <span className="text-cyan-500">8</span>
                </div>
                <div className="text-gray-600 animate-in fade-in duration-500">
                  SOURCE: <span className="text-cyan-500">gnomAD_v2 + v3</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6 min-h-[600px]">
          {/* User message */}
          <div className="flex gap-3 flex-row-reverse">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded overflow-hidden bg-gray-900 flex items-center justify-center">
                <User className="h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="flex-1 space-y-1 items-end">
              <div className="flex items-center gap-2 font-mono text-xs justify-end">
                <span className="text-gray-600">USER</span>
                <span className="text-gray-700">@</span>
                <span className="text-gray-600">
                  {new Date().toLocaleTimeString('en-US', { hour12: false })}
                </span>
              </div>

              <Card className="border bg-gray-950 border-gray-800 inline-block">
                <div className="p-3">
                  <div className="font-mono text-xs text-gray-300">
                    {isPlaying ? (
                      <TypeWriter
                        text={userQuery}
                        speed={50}
                        onComplete={() => setStep(1)}
                      />
                    ) : (
                      userQuery
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Assistant intro response */}
          {step >= 1 && (
            <StreamingMessage
              content={introResponse}
              speed={30}
              delay={500}
              onComplete={() => setStep(2)}
            />
          )}

          {/* Visualization */}
          {step >= 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <PopulationHeatmap
                variant="2:21006087:C>T"
                clinicalSignificance="Pathogenic/Likely_pathogenic"
                globalFrequency={0.00637}
                populations={populationData}
                delay={500}
                onComplete={() => setIsPlaying(false)}
              />
            </div>
          )}
        </div>
      </div>

      <DemoControls
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onPause={handlePause}
        onRestart={handleRestart}
      />
    </>
  );
}