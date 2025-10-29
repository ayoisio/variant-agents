'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TypeWriter } from '@/components/demo/TypeWriter';
import { StreamingMessage } from '@/components/demo/StreamingMessage';
import { DemoControls } from '@/components/demo/DemoControls';
import { User, Terminal, Send, FileText } from 'lucide-react';

export default function CardiovascularQueryDemo() {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const userQuery = "Show me pathogenic variants in cardiovascular genes";
  
  const assistantResponse = `In **CLINICAL mode**, focusing on ACMG secondary findings, here are the pathogenic or likely pathogenic variants found in cardiovascular genes:

**Summary of Findings:** A total of **19 pathogenic or likely pathogenic variants** were identified across **10 unique genes** associated with cardiovascular conditions.

**Variant Details:**

* **APOB**
   * Variant ID: \`2:21006087:C>T\`
   * Clinical Significance: Pathogenic/Likely_pathogenic
   * Frequency (gnomAD_v2): Global: 0.00637%

* **PCSK9**
   * Variant ID: \`chr1:55038977:G>A\`
   * Clinical Significance: Pathogenic/Likely_pathogenic
   * Variant ID: \`chr1:55052420:G>A\`
   * Clinical Significance: Pathogenic/Likely_pathogenic
   * Variant ID: \`chr1:55057360:A>G\`
   * Clinical Significance: Pathogenic/Likely_pathogenic

* **CASQ2**
   * Variant ID: \`chr1:115768745:G>GCACACACA\`
   * Clinical Significance: Pathogenic/Likely_pathogenic

* **RYR2**
   * Variant ID: \`chr1:237833281:G>GA\`
   * Clinical Significance: Pathogenic/Likely_pathogenic
   * Variant ID: \`chr1:237687464:C>A\`
   * Clinical Significance: Likely pathogenic
   * Variant ID: \`chr1:237687471:G>T\`
   * Clinical Significance: Likely pathogenic

* **DSP**
   * Variant ID: \`chr6:7585734:G>C\`
   * Clinical Significance: Pathogenic/Likely_pathogenic

* **TRDN**
   * Variant ID: \`chr6:123260618:C>A\`
   * Clinical Significance: Likely pathogenic

* **KCNH2**
   * Variant ID: \`chr7:150948431:T>C\`
   * Clinical Significance: Pathogenic/Likely_pathogenic
   * Variant ID: \`chr7:150948445:CTTGT>C\`
   * Clinical Significance: Pathogenic/Likely_pathogenic
   * Variant ID: \`chr7:150948448:GT>G\`
   * Clinical Significance: Likely pathogenic
   * Variant ID: \`chr7:150948452:GT>G\`
   * Clinical Significance: Likely pathogenic
   * Variant ID: \`chr7:150948467:GA>G\`
   * Clinical Significance: Likely pathogenic
   * Variant ID: \`chr7:150948512:GT>G\`
   * Clinical Significance: Likely pathogenic

* **MYH7**
   * Variant ID: \`chr14:23419114:T>TG\`
   * Clinical Significance: Pathogenic/Likely_pathogenic

* **MYH11**
   * Variant ID: \`chr16:15725150:C>A\`
   * Clinical Significance: Pathogenic/Likely_pathogenic

* **LDLR**
   * Variant ID: \`chr19:11105599:C>G\`
   * Clinical Significance: Pathogenic/Likely_pathogenic

These findings are crucial for identifying individuals at risk for various cardiovascular diseases and guiding appropriate clinical management and family screening.`;

  useEffect(() => {
    if (isPlaying) {
      if (step === 0) {
        const timeout = setTimeout(() => setStep(1), userQuery.length * 50 + 500);
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
              <Badge variant="outline" className="border-green-900 text-green-500 font-mono text-xs">
                CLINICAL_MODE
              </Badge>
              <div className="font-mono text-xs text-gray-600">
                <span className="text-gray-600">VARIANTS:</span>
                <span className="text-gray-400 ml-1">7,842,319</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info bar */}
        <div className="border border-gray-900 rounded-lg p-3 bg-gray-950/50">
          <div className="flex items-center gap-6 font-mono text-xs">
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="h-3 w-3" />
              <span>FILE:</span>
              <span className="text-green-500">HG002.deepvariant.vcf.gz</span>
            </div>
            
            <div className="text-gray-600">
              VEP: <span className="text-green-500">COMPLETE</span>
            </div>
            
            {step >= 1 && (
              <div className="text-gray-600 animate-in fade-in duration-500">
                PATHOGENIC: <span className="text-red-500">19</span>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6 min-h-[500px]">
          {/* User message */}
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded overflow-hidden bg-gray-900 flex items-center justify-center">
                <User className="h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-gray-600">USER</span>
                <span className="text-gray-700">@</span>
                <span className="text-gray-600">
                  {new Date().toLocaleTimeString('en-US', { hour12: false })}
                </span>
              </div>

              <Card className="border bg-gray-950 border-gray-800">
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

          {/* Assistant response */}
          {step >= 1 && (
            <StreamingMessage
              content={assistantResponse}
              speed={20}
              delay={500}
              onComplete={() => setIsPlaying(false)}
            />
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