'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, Mail, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireEmailVerification?: boolean;
  requiredRole?: string;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * Protected route wrapper component
 */
export function ProtectedRoute({
  children,
  requireEmailVerification = false,
  requiredRole,
  fallback,
  redirectTo = '/auth/login'
}: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading, isEmailVerified, resendVerificationEmail } = useAuth();

  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Check authentication
  useEffect(() => {
    if (!loading && !user) {
      // Save current path for redirect after login
      const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(pathname)}`;
      router.push(redirectUrl);
    }
  }, [user, loading, router, pathname, redirectTo]);

  // Handle email resend
  const handleResendEmail = async () => {
    setResendingEmail(true);
    setEmailSent(false);

    try {
      await resendVerificationEmail();
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 5000);
    } catch (error) {
      console.error('Failed to resend email:', error);
    } finally {
      setResendingEmail(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="dna-loader" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      )
    );
  }

  // Not authenticated
  if (!user) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md genomic-card">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center space-y-4">
                <div className="p-3 rounded-full bg-destructive/10">
                  <Shield className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold text-lg">Authentication Required</h3>
                  <p className="text-sm text-muted-foreground">
                    Please sign in to access this page
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => router.push(redirectTo)}
                >
                  Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    );
  }

  // Email verification required
  if (requireEmailVerification && !isEmailVerified()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md genomic-card">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="p-3 rounded-full bg-warning/10">
                  <Mail className="h-8 w-8 text-warning" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold text-lg">Email Verification Required</h3>
                  <p className="text-sm text-muted-foreground">
                    Please verify your email address to continue
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Check your inbox for: <strong>{user.email}</strong>
                  </p>
                </div>
              </div>

              {emailSent && (
                <Alert className="animate-in">
                  <Mail className="h-4 w-4" />
                  <AlertTitle>Email Sent!</AlertTitle>
                  <AlertDescription>
                    We've sent a new verification email to your inbox
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={handleResendEmail}
                  disabled={resendingEmail || emailSent}
                  className="w-full"
                >
                  {resendingEmail ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : emailSent ? (
                    'Email Sent!'
                  ) : (
                    'Resend Verification Email'
                  )}
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => router.push('/auth/login')}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Role check
  if (requiredRole && profile?.role !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md genomic-card">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">Access Denied</h3>
                <p className="text-sm text-muted-foreground">
                  You don't have permission to access this page
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => router.push('/dashboard')}
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All checks passed, render children
  return <>{children}</>;
}

/**
 * Higher-order component for protected pages
 */
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ProtectedRouteProps, 'children'>
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}