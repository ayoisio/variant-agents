// components/chat/HowItWorksModal.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  MessageSquare,
  Dna,
  ChevronRight,
  Send,
  FileText
} from 'lucide-react';

interface HowItWorksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HowItWorksModal({ open, onOpenChange }: HowItWorksModalProps) {
  const [helpStep, setHelpStep] = useState(0);

  const handleClose = () => {
    localStorage.setItem('hasSeenAnalysisHelp', 'true');
    onOpenChange(false);
    setHelpStep(0); // Reset step when closing
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dna className="h-5 w-5 text-primary" />
            How Genomic Analysis Works
          </DialogTitle>
          <DialogDescription>
            A quick guide to analyzing VCF files and understanding the workflow
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Step 1: Upload VCF */}
          <Card className={`p-4 transition-all ${helpStep === 0 ? 'ring-2 ring-primary' : ''}`}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold">1</span>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Start a Conversation About Your VCF</h4>
                <p className="text-sm text-muted-foreground">
                  Simply chat with the system like you would with a colleague. Provide your VCF file path
                  and any specific analysis requests in natural language.
                </p>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Example conversations:</p>
                  <div className="bg-muted p-2 rounded text-xs font-mono">
                    "Please analyze this VCF file: gs://brain-genomics/sample.vcf"
                  </div>
                  <div className="bg-muted p-2 rounded text-xs font-mono">
                    "I have a patient's VCF at gs://data/patient123.vcf - can you check for cardiac variants?"
                  </div>
                  <div className="bg-muted p-2 rounded text-xs font-mono">
                    "Analyze gs://genomics/trio.vcf focusing on de novo mutations"
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Step 2: VEP Processing */}
          <Card className={`p-4 transition-all ${helpStep === 1 ? 'ring-2 ring-primary' : ''}`}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold">2</span>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  Background Processing
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    ~60-70 min
                  </Badge>
                </h4>
                <p className="text-sm text-muted-foreground">
                  The system will parse your VCF and start VEP annotation in the background.
                  You'll see a progress indicator and can leave and return later.
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    <span>Pending</span>
                  </div>
                  <ChevronRight className="h-3 w-3" />
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span>Running</span>
                  </div>
                  <ChevronRight className="h-3 w-3" />
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Complete</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Step 3: Report Generation */}
          <Card className={`p-4 transition-all ${helpStep === 2 ? 'ring-2 ring-primary' : ''}`}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold">3</span>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  Report Generation
                  <Badge variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    ~3-5 min
                  </Badge>
                </h4>
                <p className="text-sm text-muted-foreground">
                  Once VEP completes, ask for your report. The system will query gnomAD population frequencies,
                  ClinVar annotations, and generate a comprehensive clinical assessment.
                </p>
                <div className="bg-muted p-2 rounded text-xs font-mono">
                  Example: "Is my analysis complete? Please provide the report."
                </div>
              </div>
            </div>
          </Card>

          {/* Step 4: Interactive Queries */}
          <Card className={`p-4 transition-all ${helpStep === 3 ? 'ring-2 ring-primary' : ''}`}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold">4</span>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  Ask Follow-up Questions
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Instant
                  </Badge>
                </h4>
                <p className="text-sm text-muted-foreground">
                  After receiving your report, ask specific questions about genes, variants, or clinical findings.
                  Responses are instant since the data is already processed.
                </p>
                <div className="space-y-1">
                  <div className="bg-muted p-2 rounded text-xs font-mono">
                    "Were any pathogenic variants found in the APOB gene?"
                  </div>
                  <div className="bg-muted p-2 rounded text-xs font-mono">
                    "Show me all cardiac-related findings"
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Tips Section */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Send className="h-4 w-4" />
              Pro Tips
            </h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                You can leave and return anytime - your analysis continues in the background
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                The system analyzes ALL variants, not just a gene panel
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Population frequencies from gnomAD help identify rare variants
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Save your session ID to return to your analysis later
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setHelpStep(prev => Math.max(0, prev - 1))}
              disabled={helpStep === 0}
            >
              Previous
            </Button>
            <Button
              onClick={() => {
                if (helpStep < 3) {
                  setHelpStep(prev => prev + 1);
                } else {
                  handleClose();
                }
              }}
            >
              {helpStep === 3 ? 'Get Started' : 'Next'}
            </Button>
            <Button
              variant="ghost"
              onClick={handleClose}
              className="ml-auto"
            >
              Skip Tutorial
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}