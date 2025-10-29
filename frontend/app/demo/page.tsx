'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  BarChart3, 
  BookOpen, 
  ArrowRight,
  Terminal,
  Video
} from 'lucide-react';

export default function DemoIndexPage() {
  const demos = [
    {
      id: 'cardiovascular-query',
      title: 'Pathogenic Variants Query',
      description: 'Demonstrates conversational query for cardiovascular pathogenic variants with streaming response showing 19 variants across 10 genes.',
      icon: Activity,
      badge: 'Clinical Analysis',
      badgeColor: 'border-red-900 text-red-500',
      path: '/demo/cardiovascular-query',
      features: [
        'Real-time streaming response',
        'Multi-gene variant display',
        'Clinical significance tagging',
        'Frequency data integration'
      ]
    },
    {
      id: 'apob-populations',
      title: 'Population Frequency Comparison',
      description: 'Shows gnomAD BigQuery integration with animated population heatmap displaying ancestry-specific allele frequencies for APOB variant.',
      icon: BarChart3,
      badge: 'Visualization',
      badgeColor: 'border-cyan-900 text-cyan-500',
      path: '/demo/apob-populations',
      features: [
        'gnomAD BigQuery integration',
        'Animated population bars',
        '8 ancestry groups',
        'Comparative frequency analysis'
      ]
    },
    {
      id: 'apob-clinical',
      title: 'Clinical Significance Query',
      description: 'Detailed gene knowledge query showing clinical implications, associated conditions, and actionable recommendations for APOB variants.',
      icon: BookOpen,
      badge: 'Knowledge Base',
      badgeColor: 'border-blue-900 text-blue-500',
      path: '/demo/apob-clinical',
      features: [
        'Comprehensive gene information',
        'Associated conditions',
        'Clinical action items',
        'Inheritance patterns'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Terminal className="h-8 w-8 text-green-500" />
            <h1 className="text-3xl font-bold font-mono">
              Conversational Genomics
              <span className="text-green-500 ml-2">Demos</span>
            </h1>
          </div>
          
          <p className="text-gray-400 font-mono text-sm max-w-2xl mx-auto">
            Interactive demonstrations of the conversational genomics interface.
            Each demo is optimized for screen recording and showcases key interaction patterns.
          </p>

          <div className="flex items-center justify-center gap-2">
            <Video className="h-4 w-4 text-gray-600" />
            <span className="font-mono text-xs text-gray-600">
              Recommended: Record at 1080p or higher for blog embeds
            </span>
          </div>
        </div>

        {/* Demo cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {demos.map((demo) => {
            const Icon = demo.icon;
            return (
              <Card 
                key={demo.id}
                className="bg-gray-950 border-gray-800 hover:border-gray-700 transition-all hover:scale-105"
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded bg-gray-900 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-green-500" />
                    </div>
                    <Badge variant="outline" className={`${demo.badgeColor} font-mono text-xs`}>
                      {demo.badge}
                    </Badge>
                  </div>
                  
                  <CardTitle className="text-lg">{demo.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {demo.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    {demo.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-gray-500">
                        <div className="w-1 h-1 rounded-full bg-green-500" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    asChild
                    className="w-full bg-green-950 hover:bg-green-900 text-green-400 font-mono"
                  >
                    <Link href={demo.path}>
                      LAUNCH_DEMO
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recording tips */}
        <Card className="bg-gray-950 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Video className="h-5 w-5 text-gray-400" />
              Recording Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-400">
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-300 font-mono text-xs">Before Recording:</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Set browser zoom to 100%</li>
                  <li>• Hide browser bookmarks bar</li>
                  <li>• Use full-screen mode (F11)</li>
                  <li>• Close unnecessary browser tabs</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-300 font-mono text-xs">During Recording:</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Let animations complete fully</li>
                  <li>• Use pause for emphasis points</li>
                  <li>• Record 2-3 takes for best result</li>
                  <li>• Capture ~10-15 seconds per demo</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-900">
              <p className="text-xs text-gray-600 font-mono">
                <span className="text-gray-500">TIP:</span> Each demo auto-plays when you click the Play button.
                Use Restart to reset for multiple takes.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Back link */}
        <div className="text-center">
          <Button
            variant="ghost"
            asChild
            className="font-mono text-xs text-gray-600 hover:text-gray-400"
          >
            <Link href="/">
              ← Back to Main Site
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}