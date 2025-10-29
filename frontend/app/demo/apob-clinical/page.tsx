'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TypeWriter } from '@/components/demo/TypeWriter';
import { StreamingMessage } from '@/components/demo/StreamingMessage';
import { DemoControls } from '@/components/demo/DemoControls';
import { User, Terminal, BookOpen, Activity } from 'lucide-react';

export default function ApobClinicalDemo() {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const userQuery = "What is the clinical significance of APOB?";
  
  const assistantResponse = `The **APOB gene** (Apolipoprotein B) is clinically significant due to its crucial role in **lipid metabolism** and its association with several inherited disorders. Here's a breakdown of its clinical significance:

**1. Function:**

APOB encodes apolipoprotein B, a primary structural and functional protein of chylomicrons and low-density lipoproteins (LDL). It is essential for the assembly, secretion, and metabolism of these lipid particles, which transport fats and cholesterol in the bloodstream.

**2. Associated Conditions:**

Pathogenic variants in the APOB gene are primarily associated with disorders of lipid metabolism, including:

* **Familial Hypobetalipoproteinemia (FHBL):** This condition is characterized by very low levels of LDL cholesterol and apolipoprotein B in the blood. It can range from asymptomatic to causing symptoms like fatty liver and neurological issues, depending on the severity of the APOB deficiency.

* **Familial Hypercholesterolemia (FH):** While most commonly caused by variants in the LDLR gene, certain pathogenic variants in APOB (specifically affecting the ligand-binding domain of APOB) can also cause FH. This condition leads to very high levels of LDL cholesterol from birth, increasing the risk of early-onset cardiovascular disease.

**3. Clinical Implications:**

The presence of pathogenic or likely pathogenic variants in APOB indicates an increased genetic predisposition to these lipid disorders. This warrants:

* **Further Clinical Evaluation:** To assess the individual's lipid profile and clinical presentation.

* **Genetic Counseling:** To discuss inheritance patterns, potential health risks, and management strategies.

* **Family Screening:** To identify other affected or at-risk family members.

**In your case**, one **Pathogenic/Likely Pathogenic variant** was identified in the APOB gene (\`2:21006087:C>T\`), which suggests a potential impact on lipid metabolism and warrants clinical follow-up.`;

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
              <Badge variant="outline" className="border-blue-900 text-blue-500 font-mono text-xs">
                <BookOpen className="h-3 w-3 mr-1" />
                KNOWLEDGE_QUERY
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
              CHROMOSOME: <span className="text-gray-400">2</span>
            </div>
            
            {step >= 1 && (
              <>
                <div className="text-gray-600 animate-in fade-in duration-500">
                  CONDITIONS: <span className="text-yellow-500">2</span>
                </div>
                <div className="text-gray-600 animate-in fade-in duration-500">
                  SOURCE: <span className="text-blue-500">ClinVar + Literature</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6 min-h-[700px]">
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

          {/* Assistant response */}
          {step >= 1 && (
            <div className="space-y-4">
              <StreamingMessage
                content={assistantResponse}
                speed={20}
                delay={500}
                onComplete={() => setIsPlaying(false)}
              />
              
              {/* Clinical action card */}
              {step >= 1 && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-1000">
                  <Card className="border border-yellow-900/50 bg-yellow-950/20 p-4">
                    <div className="flex items-start gap-3">
                      <Activity className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <div className="font-mono text-xs text-yellow-500 font-semibold">
                          RECOMMENDED_CLINICAL_ACTIONS
                        </div>
                        <ul className="font-mono text-xs text-yellow-200 space-y-1 list-disc list-inside">
                          <li>Lipid panel assessment (LDL-C, total cholesterol, triglycerides)</li>
                          <li>Cardiovascular risk stratification</li>
                          <li>Genetic counseling for inheritance patterns</li>
                          <li>Family cascade screening indicated</li>
                          <li>Consider statin therapy based on lipid levels</li>
                        </ul>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
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