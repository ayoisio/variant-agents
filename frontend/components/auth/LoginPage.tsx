// components/auth/LoginPage.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Terminal, Lock, Key, Chrome } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signInWithGoogle, signInWithEmail, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [terminalText, setTerminalText] = useState('');

  const redirectTo = searchParams.get('redirect') || '/dashboard';

  // Terminal typing effect
  useEffect(() => {
    const text = 'Authenticating user session...';
    let index = 0;
    const interval = setInterval(() => {
      if (index <= text.length) {
        setTerminalText(text.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user && !isLoading) {
      router.push(redirectTo);
    }
  }, [user, router, redirectTo, isLoading]);

  useEffect(() => {
    return () => {
      clearError();
      setLocalError(null);
    };
  }, [clearError]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setLocalError(null);
    try {
      const result = await signInWithGoogle(false);
      if (!result) {
        await signInWithGoogle(true);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError('Missing credentials');
      return;
    }

    setIsLoading(true);
    setLocalError(null);
    try {
      await signInWithEmail(email, password, rememberMe);
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = localError || (error ? error.message : null);

  const asciiArt = ` 
┌─────────────────────────────────────┐ 
   NEW RESEARCHER INITIALIZATION 
   Grant system access privileges 
└─────────────────────────────────────┘ 
`; 

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Terminal Header */}
        <div className="font-mono text-xs text-green-500 space-y-1">
          <div>$ cd /var/secure/auth</div>
          <div>$ ./authenticate --method=credentials</div>
          <div className="text-gray-600">
            {terminalText}
            <span className="animate-pulse">_</span>
          </div>
        </div>

        {/* ASCII Box */}
        <pre className="text-green-500 text-xs font-mono"> 
          {asciiArt} 
        </pre>

        <Card className="bg-black border-green-900/50">
          <CardContent className="p-6 space-y-6">
            {/* Error Display */}
            {displayError && (
              <Alert variant="destructive" className="bg-red-950/50 border-red-900 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-mono text-xs">
                  ERROR: {displayError}
                </AlertDescription>
              </Alert>
            )}

            {/* OAuth Buttons */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-gray-800 hover:border-green-900 hover:bg-green-950/30 font-mono text-sm group"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="text-green-500">AUTHENTICATING...</span>
                ) : (
                  <>
                    <Chrome className="mr-2 h-4 w-4 text-gray-400 group-hover:text-green-500" />
                    <span className="text-gray-400 group-hover:text-green-500">
                      AUTH_VIA_GOOGLE
                    </span>
                  </>
                )}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-900" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-black px-2 text-gray-600 font-mono">OR</span>
              </div>
            </div>

            {/* Credentials Form */}
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500">USER_EMAIL</label>
                <div className="relative">
                  <Terminal className="absolute left-3 top-3 h-4 w-4 text-gray-600" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-black border-gray-800 text-green-400 font-mono pl-10 focus:border-green-900 focus:ring-green-900"
                    placeholder="researcher@institution.edu"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-gray-500">PASSWORD</label>
                  <Link
                    href="/auth/reset-password"
                    className="text-xs font-mono text-gray-600 hover:text-green-500"
                  >
                    FORGOT_PASSWORD?
                  </Link>
                </div>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-gray-600" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-black border-gray-800 text-green-400 font-mono pl-10 focus:border-green-900 focus:ring-green-900"
                    placeholder="••••••••••••••••"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="persist"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  disabled={isLoading}
                  className="border-gray-700 data-[state=checked]:bg-green-900 data-[state=checked]:border-green-900"
                />
                <label htmlFor="persist" className="text-xs font-mono text-gray-500 cursor-pointer">
                  PERSIST_SESSION=true
                </label>
              </div>

              <Button
                type="submit"
                className="w-full bg-green-950 hover:bg-green-900 text-green-400 font-mono text-sm"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span>VALIDATING_CREDENTIALS...</span>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    AUTHENTICATE
                  </>
                )}
              </Button>
            </form>

            {/* Terminal Output */}
            <div className="pt-4 border-t border-gray-900">
              <div className="font-mono text-xs space-y-1 text-gray-600">
                <div>[AUTH] Mode: {rememberMe ? 'persistent' : 'session'}</div>
                <div>[AUTH] Endpoint: /auth/login</div>
                <div>[AUTH] Status: {isLoading ? 'pending' : 'ready'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="text-center space-y-3">
          <div className="font-mono text-xs text-gray-600">
            NO_ACCOUNT?{' '}
            <Link href="/auth/signup" className="text-green-600 hover:text-green-500">
              INITIALIZE_NEW_USER
            </Link>
          </div>

          <div className="font-mono text-xs text-gray-700">
            <Link
              href="https://github.com/ayoisio/variant-agents"
              className="hover:text-gray-500"
            >
              docs
            </Link>
            {' | '}
            <Link
              href="https://github.com/ayoisio/variant-agents/issues"
              className="hover:text-gray-500"
            >
              report_issue
            </Link>
            {' | '}
            <Link
              href="https://github.com/ayoisio/variant-agents/wiki"
              className="hover:text-gray-500"
            >
              wiki
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
