import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demo | Variant Agents',
  description: 'Interactive demonstrations of conversational genomic analysis',
  robots: {
    index: false, // Don't index demo pages
    follow: false,
  },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      {/* Recording indicator */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 font-mono text-xs text-gray-600">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span>DEMO_MODE</span>
      </div>
      
      {/* Centered, slightly scaled content for recording */}
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-6xl" style={{ transform: 'scale(1.15)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}