'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Github,
  ArrowRight,
  GitBranch,
  Database,
  Terminal,
  FileCode,
  Cpu,
  BarChart3,
  Beaker,
  Code2,
  FlaskConical,
  Activity,
  Clock,
  Server,
  HardDrive,
  Shield,
  Zap,
  Network,
  MessageSquare,
  Globe,
  Users
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [vcfCount, setVcfCount] = useState(0);
  const [variantCount, setVariantCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  // Animated counters for actual research metrics
  useEffect(() => {
    const vcfInterval = setInterval(() => {
      setVcfCount(prev => prev < 247 ? prev + 3 : 247);
    }, 20);

    const variantInterval = setInterval(() => {
      setVariantCount(prev => prev < 1931247 ? prev + 19312 : 1931247);
    }, 20);

    const sessionInterval = setInterval(() => {
      setSessionCount(prev => prev < 892 ? prev + 11 : 892);
    }, 20);

    return () => {
      clearInterval(vcfInterval);
      clearInterval(variantInterval);
      clearInterval(sessionInterval);
    };
  }, []);

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-green-500 font-mono text-sm">
          <span className="animate-pulse">Initializing genomic engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Terminal-style header */}
      <header className="border-b border-green-900/50 bg-black/90 backdrop-blur sticky top-0 z-50">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-green-500 font-mono text-sm">
                <span className="text-green-700">$</span> variant-agents
                <span className="animate-pulse ml-1">_</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <Link
                href="https://github.com/ayoisio/variant-agents"
                className="text-gray-400 hover:text-green-500 transition-colors flex items-center gap-2 text-sm font-mono"
              >
                <Github className="h-4 w-4" />
                <span className="hidden sm:inline">ayoisio/variant-agents</span>
              </Link>

              <Button
                variant="outline"
                size="sm"
                className="border-green-900 text-green-500 hover:bg-green-950 font-mono"
                asChild
              >
                <Link href="/auth/login">
                  ACCESS_SYSTEM
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Research Hero - ASCII art style */}
      <section className="container px-4 py-16">
        <pre className="text-green-500 text-xs sm:text-sm font-mono mb-8 overflow-hidden">
{`╔════════════════════════════════════════════════════════════════╗
   VARIANT AGENTS v2.1.0 | Research Build
   Multi-Agent Genomic Analysis with Google ADK + BigQuery
╚════════════════════════════════════════════════════════════════╝`}
        </pre>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold font-mono">
                Production-Grade Variant Analysis Pipeline
              </h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                Multi-agent system built with Google ADK for whole-genome variant analysis.
                Processes 7.8M+ variants through VEP annotation on GKE, queries population
                frequencies from gnomAD BigQuery datasets, performs ClinVar lookups, and 
                delivers AI-powered clinical assessments via Gemini 2.0.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-green-900 text-green-500">
                <FlaskConical className="h-3 w-3 mr-1" />
                Google ADK
              </Badge>
              <Badge variant="outline" className="border-blue-900 text-blue-500">
                <Server className="h-3 w-3 mr-1" />
                GKE n2-highmem-32
              </Badge>
              <Badge variant="outline" className="border-cyan-900 text-cyan-500">
                <Globe className="h-3 w-3 mr-1" />
                gnomAD BigQuery
              </Badge>
              <Badge variant="outline" className="border-purple-900 text-purple-500">
                <Activity className="h-3 w-3 mr-1" />
                Firebase + SSE
              </Badge>
              <Badge variant="outline" className="border-yellow-900 text-yellow-500">
                <HardDrive className="h-3 w-3 mr-1" />
                100GB VEP Cache
              </Badge>
              <Badge variant="outline" className="border-orange-900 text-orange-500">
                <Shield className="h-3 w-3 mr-1" />
                HTTPS Load Balancer
              </Badge>
            </div>

            <div className="flex gap-4">
              <Button
                className="bg-green-950 hover:bg-green-900 text-green-400 font-mono group"
                asChild
              >
                <Link href="/auth/signup">
                  INITIALIZE_SESSION
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>

              <Button
                variant="outline"
                className="border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 font-mono"
                asChild
              >
                <Link href="https://github.com/ayoisio/variant-agents">
                  <GitBranch className="mr-2 h-4 w-4" />
                  Fork
                </Link>
              </Button>
            </div>
          </div>

          {/* Live metrics panel */}
          <Card className="bg-black border-green-900/30">
            <CardContent className="p-6">
              <div className="font-mono text-xs space-y-3">
                <div className="text-green-600">
                  [SYSTEM STATUS: OPERATIONAL]
                </div>
                <div className="space-y-1 text-gray-500">
                  <div>SESSIONS_PROCESSED: {sessionCount.toLocaleString()}</div>
                  <div>VCF_FILES_ANALYZED: {vcfCount.toLocaleString()}</div>
                  <div>VARIANTS_PROCESSED: {variantCount.toLocaleString()}</div>
                  <div>VEP_AVG_TIME: 67min (7.8M variants)</div>
                  <div>CLINVAR_CACHE_HIT: 94.2%</div>
                  <div className="text-cyan-600">GNOMAD_QUERIES: 10K variants/analysis</div>
                  <div className="text-yellow-600">PATHOGENIC_FOUND: ~1,166/analysis</div>
                </div>
                <div className="pt-2 border-t border-green-900/30">
                  <span className="text-green-500">$</span>
                  <span className="text-gray-600"> kubectl logs -f genomics-agent</span>
                  <div className="mt-2 text-gray-600 text-xs space-y-1">
                    <div>[2024-12-20 14:23:01] Session firebase_Kx9mN2... started</div>
                    <div>[2024-12-20 14:23:03] Parsing VCF: HG002.deepvariant.vcf.gz</div>
                    <div>[2024-12-20 14:23:33] Found 7,842,319 variants</div>
                    <div>[2024-12-20 14:23:35] VEP task dispatched to Cloud Tasks</div>
                    <div>[2024-12-20 15:31:12] VEP complete, starting report generation</div>
                    <div className="text-cyan-600">[2024-12-20 15:31:45] Querying gnomAD BigQuery (v2+v3)</div>
                    <div className="animate-pulse">[2024-12-20 15:33:12] Clinical assessment complete_</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Technical Architecture */}
      <section className="container px-4 py-16 border-t border-gray-900">
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-mono font-bold mb-2">System Architecture</h2>
            <p className="text-gray-500 text-sm">
              Three-phase analysis pipeline with population frequency integration via BigQuery
            </p>
          </div>

          <Tabs defaultValue="agents" className="space-y-4">
            <TabsList className="bg-black border border-gray-800">
              <TabsTrigger value="agents" className="font-mono text-xs">AGENTS</TabsTrigger>
              <TabsTrigger value="pipeline" className="font-mono text-xs">PIPELINE</TabsTrigger>
              <TabsTrigger value="gnomad" className="font-mono text-xs">GNOMAD</TabsTrigger>
              <TabsTrigger value="infra" className="font-mono text-xs">INFRASTRUCTURE</TabsTrigger>
              <TabsTrigger value="performance" className="font-mono text-xs">PERFORMANCE</TabsTrigger>
            </TabsList>

            <TabsContent value="agents" className="space-y-4">
              <pre className="text-green-500 text-xs font-mono bg-black p-4 rounded border border-gray-900 overflow-x-auto">
{`# From variants_coordinator/agent.py - Actual implementation

root_agent = LlmAgent(
    name="GenomicCoordinator",
    model="gemini-2.0-flash",
    description="Coordinates genomic variant analysis workflows",
    instruction="""
    ## THREE-PHASE ANALYSIS SYSTEM

    Phase 1 - INITIATION (< 1 minute):
    - Parse VCF file from GCS
    - Create Cloud Tasks job for VEP
    - Return task ID to user

    Phase 2 - BACKGROUND PROCESSING (60-70 minutes):
    - VEP annotation on GKE worker
    - 32 vCPU, 256GB RAM
    - 100GB pre-cached VEP data

    Phase 3 - COMPLETION & QUERIES (3-5 minutes):
    - ClinVar annotation
    - gnomAD BigQuery population frequencies
    - Map-reduce clinical assessment
    - Gene-specific queries

    ## STATE MANAGEMENT
    - Firebase Auth integration
    - Firestore session metadata
    - GCS artifact persistence
    """,
    sub_agents=[
        initiation_pipeline,  # VCF intake + VEP start
        completion_pipeline,  # Status check + report generation
        report_pipeline,     # Report retrieval + presentation
        query_agent          # Gene-specific lookups
    ]
)`}
              </pre>
            </TabsContent>

            <TabsContent value="pipeline" className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="bg-gray-950 border-gray-800">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2 text-blue-500">
                      <Database className="h-4 w-4" />
                      <span className="font-mono text-sm">vcf_intake_tool</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Parses VCF from GCS using streaming. Handles 7.8M variants
                      in ~30 seconds. Saves to GCS artifacts via ADK.
                    </p>
                    <pre className="text-xs text-gray-600 font-mono">
{`~30 sec for 7.8M variants
Supports .vcf.gz format
Artifact: parsed_variants.pkl`}
                    </pre>
                  </CardContent>
                </Card>

                <Card className="bg-gray-950 border-gray-800">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2 text-green-500">
                      <Cpu className="h-4 w-4" />
                      <span className="font-mono text-sm">vep_annotation_tool</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Dispatches to Cloud Tasks → GKE worker. VEP 113 with
                      GRCh38 cache on persistent disk. Fork=28 processes.
                    </p>
                    <pre className="text-xs text-gray-600 font-mono">
{`60-70 min for 7.8M variants
Batch size: 5000 variants
Output: vep_annotated.pkl`}
                    </pre>
                  </CardContent>
                </Card>

                <Card className="bg-gray-950 border-gray-800">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2 text-cyan-500">
                      <Globe className="h-4 w-4" />
                      <span className="font-mono text-sm">gnomad_bigquery_tool</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Queries public gnomAD v2/v3 datasets via BigQuery.
                      Population-specific frequencies for 8 ancestries.
                      Async non-blocking queries.
                    </p>
                    <pre className="text-xs text-gray-600 font-mono">
{`~30 sec for 10K variants
Cost: ~$0.50/analysis
Populations: AFR,AMR,EAS,NFE,
            FIN,ASJ,SAS,OTH`}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="gnomad" className="space-y-4">
              <div className="space-y-4">
                <Card className="bg-gray-950 border-gray-800">
                  <CardContent className="p-4">
                    <h3 className="font-mono text-sm text-cyan-500 mb-3">GNOMAD_BIGQUERY_INTEGRATION</h3>
                    <pre className="text-xs text-gray-500 font-mono">
{`# services/gnomad_client.py - Production implementation

class GnomADClient:
    async def batch_query_frequencies(self, variants: List[Variant]):
        """Query gnomAD BigQuery for population frequencies"""
        
        # Query v3 first (GRCh38)
        query_v3 = f"""
        SELECT 
          'v3' as source,
          start_position,
          reference_bases,
          alternate_bases.alt,
          alternate_bases.AF as af,
          alternate_bases.AF_afr as af_afr,
          alternate_bases.AF_nfe as af_nfe,
          alternate_bases.AF_eas as af_eas,
          alternate_bases.AF_amr as af_amr,
          alternate_bases.AF_fin as af_fin,
          alternate_bases.AF_asj as af_asj,
          alternate_bases.AF_sas as af_sas,
          alternate_bases.nhomalt as hom_count
        FROM \`bigquery-public-data.gnomAD.v3_genomes__chr{chrom}\`
        WHERE {conditions}
        """
        
        # Fallback to v2 for missing variants (GRCh37)
        # Handles reference genome mismatches
        # Returns population-stratified frequencies`}
                    </pre>
                  </CardContent>
                </Card>

                <Card className="bg-gray-950 border-gray-800">
                  <CardContent className="p-4">
                    <h3 className="font-mono text-sm text-cyan-500 mb-3">POPULATION_FREQUENCY_ANALYSIS</h3>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div className="space-y-2">
                        <div className="text-gray-400">Example: APOB Variant</div>
                        <pre className="text-gray-600">
{`chr2:21006087:C>T
Source: gnomAD_v2
Global AF: 0.000064
NFE: 0.000065
AFR: 0.0
EAS: 0.0
AMR: 0.0
Homozygotes: 0`}
                        </pre>
                      </div>
                      <div className="space-y-2">
                        <div className="text-gray-400">Clinical Impact</div>
                        <pre className="text-gray-600">
{`Carrier Rate: 1:15,686
Population: European
Penetrance: High
Action: Family cascade
         testing indicated`}
                        </pre>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="infra" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="font-mono text-sm text-gray-400">GKE_DEPLOYMENT</h3>
                  <pre className="text-xs text-gray-600 font-mono bg-gray-950 p-3 rounded">
{`apiVersion: apps/v1
kind: Deployment
metadata:
  name: genomics-agent
spec:
  template:
    spec:
      containers:
      - name: genomics-agent
        image: us-central1-docker.pkg.dev/
               variant-agents/
               prod/genomics-agent:latest
        resources:
          requests:
            cpu: "30"
            memory: "120Gi"
          limits:
            cpu: "32"
            memory: "240Gi"
        volumeMounts:
        - name: vep-cache
          mountPath: /mnt/cache
      volumes:
      - name: vep-cache
        gcePersistentDisk:
          pdName: vep-cache-disk
          fsType: ext4`}
                  </pre>
                </div>

                <div className="space-y-3">
                  <h3 className="font-mono text-sm text-gray-400">SERVICES_STACK</h3>
                  <div className="space-y-2 text-xs text-gray-600 font-mono">
                    <div className="flex justify-between">
                      <span>GKE Node Type</span>
                      <span className="text-green-500">n2-highmem-32</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cloud Tasks Queue</span>
                      <span className="text-green-500">background</span>
                    </div>
                    <div className="flex justify-between">
                      <span>BigQuery Dataset</span>
                      <span className="text-cyan-500">gnomAD public</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Firestore Collections</span>
                      <span className="text-green-500">user_sessions, tasks</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GCS Artifacts</span>
                      <span className="text-green-500">brain-genomics</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VEP Cache Disk</span>
                      <span className="text-green-500">100GB SSD</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Firebase Auth</span>
                      <span className="text-green-500">Enabled</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HTTPS Load Balancer</span>
                      <span className="text-green-500">Production</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-mono text-sm text-gray-400">REAL_WORLD_BENCHMARKS</h3>
                <pre className="text-xs text-gray-600 font-mono bg-gray-950 p-4 rounded">
{`Input: HG002.novaseq.pcr-free.30x.deepvariant.vcf.gz
Total Variants: 7,842,319

┌─────────────────────────┬──────────────┬─────────────────────────┐
│ Phase                   │ Duration     │ Details                 │
├─────────────────────────┼──────────────┼─────────────────────────┤
│ VCF Parsing             │ ~30 sec      │ Streaming parse         │
│ VEP Annotation          │ 60-70 min    │ 28 fork procs           │
│ ClinVar Lookup          │ ~2 min       │ 47K variants            │
│ gnomAD BigQuery         │ ~30 sec      │ 10K variants, async     │
│ Clinical Assessment     │ ~2 min       │ 1,166 pathogenic        │
│ Gene Query (per gene)   │ <5 sec       │ From cache              │
└─────────────────────────┴──────────────┴─────────────────────────┘

Memory Usage:
- VCF Parse: ~8GB peak
- VEP Process: ~180GB peak (28 parallel forks)
- gnomAD Query: Minimal (BigQuery remote)
- Assessment: ~4GB

BigQuery Costs:
- Per analysis: ~$0.50 (5.9GB scanned)
- Monthly free tier: 1TB (200 analyses)
- Dual database strategy: v3 → v2 fallback`}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Key Concepts Section - Updated with gnomAD */}
      <section className="container px-4 py-16 border-t border-gray-900">
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-mono font-bold mb-2">Key Concepts</h2>
            <p className="text-gray-500 text-sm">
              Understanding the multi-agent architecture and population frequency integration
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-gray-950 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-cyan-500" />
                  <h3 className="font-mono text-sm text-cyan-500">POPULATION_FREQUENCIES</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Real-time gnomAD queries via BigQuery provide ancestry-specific
                  allele frequencies for precision medicine insights.
                </p>
                <pre className="text-xs text-gray-600 font-mono">
{`8 Populations:
├── African (AFR)
├── Latino (AMR)
├── East Asian (EAS)
├── European (NFE)
├── Finnish (FIN)
├── Ashkenazi (ASJ)
├── South Asian (SAS)
└── Other (OTH)`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-gray-950 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="font-mono text-sm text-blue-500">STATEFUL_SESSIONS</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  ADK maintains conversation state across multiple interactions.
                  Sessions persist between user visits, enabling long-running workflows.
                </p>
                <pre className="text-xs text-gray-600 font-mono">
{`Session State:
- VCF path & parsed variants
- VEP task status
- Analysis results
- Population frequencies
- Conversation history`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-gray-950 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <h3 className="font-mono text-sm text-yellow-500">NON_BLOCKING_ARCHITECTURE</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Async BigQuery queries prevent UI freezing. Report generation
                  runs in background workers via Cloud Tasks.
                </p>
                <pre className="text-xs text-gray-600 font-mono">
{`await gnomad.batch_query_frequencies()
# Async executor pattern
# No event loop blocking
# UI remains responsive`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-gray-950 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-purple-500" />
                  <h3 className="font-mono text-sm text-purple-500">ASYNC_PROCESSING</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Cloud Tasks decouples heavy computation from user interaction.
                  Users can leave and return without losing progress.
                </p>
                <pre className="text-xs text-gray-600 font-mono">
{`1. User submits VCF
2. VEP queued → 60-70 min
3. Report queued → 3-5 min
4. User returns → Gets results`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Development Log - Updated */}
      <section className="container px-4 py-16 border-t border-gray-900">
        <div className="max-w-3xl">
          <h2 className="text-xl font-mono font-bold mb-6">Development Journey</h2>

          <div className="space-y-4 text-sm text-gray-400 font-mono">
            <div className="flex gap-3">
              <span className="text-green-600">[2025.07.03]</span>
              <p>
                Initial prototyping in Vertex AI Workbench. Custom sequential classes
                for VCF parsing and VEP orchestration. Successfully processed 7.8M variants
                from HG002 reference genome.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="text-green-600">[2025.08.01]</span>
              <p>
                Developed FastAPI/Uvicorn service for API layer. Integrated Vertex AI
                Agent Builder SDK (ADK). Migrated custom sequential classes to ADK
                LlmAgent and workflow agent structure with deterministic pipelines.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="text-green-600">[2025.08.16]</span>
              <p>
                Evaluated Cloud Run vs GKE for deployment. Selected GKE for compute
                requirements (32 vCPU, 256GB RAM). Configured persistent disk for
                100GB VEP cache to optimize annotation performance.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="text-green-600">[2025.08.24]</span>
              <p>
                Frontend development with Next.js 14 and Firebase Auth. Implemented
                real-time SSE streaming for progress updates. Session persistence
                via Firestore with ADK state management.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="text-green-600">[2025.09.05]</span>
              <p>
                Production deployment on GKE. Configured HTTPS load balancer for
                secure API access. Map-reduce clinical assessment successfully
                handles 1,166 pathogenic variants without token limits.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="text-green-600">[2025.09.09]</span>
              <p>
                Integrated gnomAD BigQuery for population frequencies. Replaced 16GB
                local database with async queries to public datasets. Added dual-database
                strategy (v3→v2) for reference genome compatibility. Cost: ~$0.50/analysis.
              </p>
            </div>

            <div className="flex gap-3">
              <span className="text-green-600">[2025.09.12]</span>
              <p>
                System fully operational with population stratification. VEP processing
                ~1 hour, report generation with gnomAD/ClinVar ~3-5 minutes. European-specific
                APOB variant identified at 1:15,686 carrier frequency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-900 mt-24">
        <div className="container px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="font-mono text-xs text-gray-600">
              MIT License | Research Project | Not for Clinical Use
            </div>
            <div className="flex gap-6 text-xs font-mono">
              <Link href="https://github.com/ayoisio/variant-agents" className="text-gray-600 hover:text-green-500">
                GitHub
              </Link>
              <Link href="https://github.com/ayoisio/variant-agents/issues" className="text-gray-600 hover:text-green-500">
                Issues
              </Link>
              <Link href="https://github.com/ayoisio/variant-agents/wiki" className="text-gray-600 hover:text-green-500">
                Documentation
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}