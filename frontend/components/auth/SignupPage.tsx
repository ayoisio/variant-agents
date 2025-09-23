// components/auth/SignupPage.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Terminal, Key, User, Mail, Hash, Chrome } from 'lucide-react';

export function SignupPage() {
  const router = useRouter();
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [initText, setInitText] = useState('');

  // Terminal typing effect
  useEffect(() => {
    const text = "Initializing new research account...";
    let index = 0;
    const interval = setInterval(() => {
      if (index <= text.length) {
        setInitText(text.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Password strength checker
  useEffect(() => {
    const pwd = formData.password;
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.match(/[a-z]/) && pwd.match(/[A-Z]/)) strength++;
    if (pwd.match(/\d/)) strength++;
    if (pwd.match(/[^a-zA-Z\d]/)) strength++;
    setPasswordStrength(strength);
  }, [formData.password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError('PASSWORD_MISMATCH: Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('WEAK_PASSWORD: Minimum 8 characters required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await signUpWithEmail(formData.email, formData.password, formData.name);
      router.push('/dashboard');
    } catch (err: any) {
      setError(`INIT_FAILED: ${err.message || 'Could not create account'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithGoogle(false);
      if (!result) {
        await signInWithGoogle(true);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(`OAUTH_FAILED: ${err.message || 'Google auth failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const getStrengthColor = () => {
    if (passwordStrength === 0) return 'text-gray-600';
    if (passwordStrength === 1) return 'text-red-500';
    if (passwordStrength === 2) return 'text-yellow-500';
    if (passwordStrength === 3) return 'text-blue-500';
    return 'text-green-500';
  };
  
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
          <div>$ mkdir /home/new_researcher</div>
          <div>$ useradd --create-home --shell /bin/bash researcher</div>
          <div className="text-gray-600">{initText}<span className="animate-pulse">_</span></div>
        </div>

        {/* ASCII Box */}
        <pre className="text-green-500 text-xs font-mono"> 
          {asciiArt} 
        </pre>

        <Card className="bg-black border-green-900/50">
          <CardContent className="p-6 space-y-6">
            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="bg-red-950/50 border-red-900 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-mono text-xs">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* OAuth Buttons (GitHub removed) */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-gray-800 hover:border-green-900 hover:bg-green-950/30 font-mono text-sm group"
                onClick={handleGoogleSignup}
                disabled={loading}
              >
                {loading ? (
                  <span className="text-green-500">CONNECTING...</span>
                ) : (
                  <>
                    <Chrome className="mr-2 h-4 w-4 text-gray-400 group-hover:text-green-500" />
                    <span className="text-gray-400 group-hover:text-green-500">
                      INIT_WITH_GOOGLE
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
                <span className="bg-black px-2 text-gray-600 font-mono">OR_MANUAL_SETUP</span>
              </div>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500">
                  RESEARCHER_NAME
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-600" />
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-black border-gray-800 text-green-400 font-mono pl-10 focus:border-green-900"
                    placeholder="Dr. Jane Smith"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500">
                  INSTITUTIONAL_EMAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-600" />
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-black border-gray-800 text-green-400 font-mono pl-10 focus:border-green-900"
                    placeholder="jsmith@research.edu"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500">
                  CREATE_PASSWORD
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-gray-600" />
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-black border-gray-800 text-green-400 font-mono pl-10 focus:border-green-900"
                    placeholder="••••••••••••••••"
                    disabled={loading}
                    required
                  />
                </div>
                {formData.password && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-gray-600">STRENGTH:</span>
                    <div className="flex gap-1">
                      {[1,2,3,4].map(level => (
                        <div
                          key={level}
                          className={`w-8 h-1 ${
                            level <= passwordStrength 
                              ? `bg-green-600` 
                              : 'bg-gray-800'
                          }`}
                        />
                      ))}
                    </div>
                    <span className={getStrengthColor()}>
                      {passwordStrength === 0 && 'WEAK'}
                      {passwordStrength === 1 && 'POOR'}
                      {passwordStrength === 2 && 'FAIR'}
                      {passwordStrength === 3 && 'GOOD'}
                      {passwordStrength === 4 && 'STRONG'}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500">
                  CONFIRM_PASSWORD
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 h-4 w-4 text-gray-600" />
                  <Input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="bg-black border-gray-800 text-green-400 font-mono pl-10 focus:border-green-900"
                    placeholder="••••••••••••••••"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-green-950 hover:bg-green-900 text-green-400 font-mono text-sm"
                disabled={loading}
              >
                {loading ? (
                  <span>CREATING_ACCOUNT...</span>
                ) : (
                  <span>INITIALIZE_RESEARCHER</span>
                )}
              </Button>
            </form>

            {/* System Requirements */}
            <div className="pt-4 border-t border-gray-900">
              <div className="font-mono text-xs space-y-1 text-gray-600">
                <div>[SYSTEM] Min password length: 8 chars</div>
                <div>[SYSTEM] Required: alphanumeric + special</div>
                <div>[SYSTEM] Storage quota: 100GB</div>
                <div>[SYSTEM] API rate limit: 1000 req/hour</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="text-center space-y-3">
          <div className="font-mono text-xs text-gray-600">
            EXISTING_USER?{' '}
            <Link
              href="/auth/login"
              className="text-green-600 hover:text-green-500"
            >
              AUTHENTICATE
            </Link>
          </div>
          
          <div className="font-mono text-xs text-gray-700">
            By creating an account, you agree to follow{' '}
            <Link href="https://github.com/ayoisio/variant-agents/blob/main/CONTRIBUTING.md" className="text-gray-600 hover:text-gray-500">
              contribution_guidelines
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
