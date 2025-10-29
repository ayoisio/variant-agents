'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PopulationData {
  name: string;
  code: string;
  frequency: number;
  color: string;
}

interface PopulationHeatmapProps {
  variant: string;
  clinicalSignificance: string;
  globalFrequency: number;
  populations: PopulationData[];
  delay?: number;
  onComplete?: () => void;
}

export function PopulationHeatmap({
  variant,
  clinicalSignificance,
  globalFrequency,
  populations,
  delay = 0,
  onComplete
}: PopulationHeatmapProps) {
  const [visible, setVisible] = useState(false);
  const [animatedPops, setAnimatedPops] = useState<number[]>([]);

  useEffect(() => {
    if (delay > 0) {
      const timeout = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timeout);
    } else {
      setVisible(true);
    }
  }, [delay]);

  useEffect(() => {
    if (!visible) return;
    
    // Animate populations appearing one by one
    const intervals: NodeJS.Timeout[] = [];
    populations.forEach((_, index) => {
      const timeout = setTimeout(() => {
        setAnimatedPops(prev => [...prev, index]);
        if (index === populations.length - 1 && onComplete) {
          setTimeout(onComplete, 500);
        }
      }, index * 150);
      intervals.push(timeout);
    });

    return () => intervals.forEach(clearTimeout);
  }, [visible, populations, onComplete]);

  if (!visible) return null;

  // Calculate max frequency for scaling
  const maxFreq = Math.max(...populations.map(p => p.frequency));

  return (
    <Card className="border bg-black border-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-sm text-green-500">POPULATION_FREQUENCY_ANALYSIS</h3>
          <Badge variant="outline" className="border-red-900 text-red-500 font-mono text-xs">
            {clinicalSignificance}
          </Badge>
        </div>
        
        <div className="space-y-1 font-mono text-xs">
          <div className="text-gray-600">
            VARIANT: <span className="text-gray-400">{variant}</span>
          </div>
          <div className="text-gray-600">
            GLOBAL_AF: <span className="text-green-400">{globalFrequency.toFixed(5)}%</span>
          </div>
        </div>
      </div>

      {/* Population bars */}
      <div className="space-y-3">
        {populations.map((pop, index) => {
          const isVisible = animatedPops.includes(index);
          const barWidth = maxFreq > 0 ? (pop.frequency / maxFreq) * 100 : 0;
          const hasData = pop.frequency > 0;
          
          return (
            <div
              key={pop.code}
              className={`transition-all duration-500 ${
                isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Population label */}
                <div className="w-32 flex-shrink-0">
                  <div className="font-mono text-xs">
                    <div className="text-gray-400">{pop.name}</div>
                    <div className="text-gray-700 text-[10px]">{pop.code}</div>
                  </div>
                </div>

                {/* Frequency bar */}
                <div className="flex-1 relative h-8 bg-gray-950 rounded border border-gray-900 overflow-hidden">
                  {hasData ? (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 transition-all duration-1000 ease-out"
                        style={{
                          width: `${barWidth}%`,
                          background: `linear-gradient(90deg, ${pop.color}40, ${pop.color})`,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-end px-2">
                        <span className="font-mono text-xs font-semibold" style={{ color: pop.color }}>
                          {pop.frequency.toFixed(5)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-mono text-xs text-gray-700">
                        NOT_DETECTED
                      </span>
                    </div>
                  )}
                </div>

                {/* Frequency value */}
                <div className="w-20 flex-shrink-0 text-right font-mono text-xs">
                  {hasData ? (
                    <span className="text-gray-400">
                      {(pop.frequency * 100).toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-gray-700">0</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend/Key observations */}
      <div className="pt-4 border-t border-gray-900">
        <div className="font-mono text-xs space-y-2">
          <div className="text-gray-600">KEY_OBSERVATIONS:</div>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li>
              Highest prevalence in{' '}
              <span className="text-gray-400">
                {populations.reduce((max, p) => p.frequency > max.frequency ? p : max).name}
              </span>
              {' '}population
            </li>
            <li>
              Absent in{' '}
              <span className="text-gray-400">
                {populations.filter(p => p.frequency === 0).length}
              </span>
              {' '}of {populations.length} populations
            </li>
            <li className="text-yellow-600">
              Population-specific risk assessment recommended
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}