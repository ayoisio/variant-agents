// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { ErrorBoundary } from '@/components/error-boundary';
import { Analytics } from '@/components/analytics';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Variant Agents | Research Build',
    template: '%s | Variant Agents'
  },
  description: 'Multi-agent genomic variant analysis system using Google ADK. Research project for whole-genome VCF processing with VEP annotation and AI-powered clinical assessment.',
  keywords: [
    'genomics',
    'variant analysis',
    'VEP',
    'Google ADK',
    'multi-agent system',
    'clinical genomics',
    'bioinformatics',
    'whole genome sequencing',
    'pathogenic variants',
    'GKE',
    'Cloud Tasks',
    'Gemini AI'
  ],
  authors: [
    {
      name: 'ayoisio',
      url: 'https://github.com/ayoisio/variant-agents'
    }
  ],
  creator: 'ayoisio',
  publisher: 'Variant Agents Research',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'Variant Agents | Multi-Agent Genomic Analysis',
    description: 'Research implementation of production-grade variant analysis pipeline. 7.8M variants processed via GKE with real-time streaming.',
    url: '/',
    siteName: 'Variant Agents',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Variant Agents - Multi-Agent Genomic Analysis System'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Variant Agents',
    description: 'Multi-agent genomic analysis with Google ADK',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png' }
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#10b981' // Green to match terminal theme
      }
    ]
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#000000' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' }
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-mono antialiased bg-black text-white`}
        suppressHydrationWarning
      >
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange={false}
          >
            <AuthProvider
              requireEmailVerification={false}
              redirectAfterSignIn="/dashboard"
              redirectAfterSignOut="/"
            >
              <div className="relative min-h-screen">
                {/* Terminal scanlines effect (subtle) */}
                <div className="fixed inset-0 pointer-events-none opacity-5">
                  <div className="h-full w-full bg-[linear-gradient(transparent_50%,rgba(0,255,0,0.1)_50%)] bg-[length:100%_4px]" />
                </div>

                {/* Main content */}
                <main className="relative z-10">
                  {children}
                </main>
              </div>

              {/* Toast notifications */}
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>

        {/* Analytics - only in production */}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}