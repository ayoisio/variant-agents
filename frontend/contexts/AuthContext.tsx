'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode
} from 'react';
import {
  User,
  UserCredential,
  AuthError,
  onAuthStateChanged,
  Unsubscribe
} from 'firebase/auth';
import { doc, onSnapshot, Unsubscribe as FirestoreUnsubscribe } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';
import {
  signInWithGoogle,
  signInWithGitHub,
  signInWithEmail,
  signUpWithEmail,
  signOut as firebaseSignOut,
  resetPassword,
  updateUserProfile,
  getIdToken,
  getIdTokenResult,
  setAuthPersistence,
  getAuthErrorMessage,
  isEmailVerified,
  resendEmailVerification,
  checkRedirectResult,
  UserProfile,
  AuthUser
} from '@/lib/firebase/auth';
import { auth, db } from '@/lib/firebase/config';

/**
 * Helper function to check if email domain is allowed
 */
const isAllowedDomain = (email: string | null): boolean => {
  if (!email) return false;

  // Extract domain from email
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;

  // Check if it's google.com/altostrat.com or a subdomain of these
  return domain === 'google.com' ||
         domain === 'altostrat.com' ||
         domain.endsWith('.google.com') ||
         domain.endsWith('.altostrat.com');
};

/**
 * Auth context state interface
 */
interface AuthContextState {
  // User state
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: AuthError | null;

  // Auth methods
  signInWithGoogle: (useRedirect?: boolean) => Promise<UserCredential | null>;
  signInWithGitHub: (useRedirect?: boolean) => Promise<UserCredential | null>;
  signInWithEmail: (email: string, password: string, remember?: boolean) => Promise<UserCredential>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<UserCredential>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (updates: { displayName?: string; photoURL?: string }) => Promise<void>;

  // Token methods
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  getIdTokenResult: (forceRefresh?: boolean) => Promise<any>;

  // Email verification
  isEmailVerified: () => boolean;
  resendVerificationEmail: () => Promise<void>;

  // Utility methods
  clearError: () => void;
  setRememberMe: (remember: boolean) => Promise<void>;
}

/**
 * Auth context
 */
const AuthContext = createContext<AuthContextState | undefined>(undefined);

/**
 * Auth provider props
 */
interface AuthProviderProps {
  children: ReactNode;
  requireEmailVerification?: boolean;
  redirectAfterSignIn?: string;
  redirectAfterSignOut?: string;
}

/**
 * Auth provider component
 */
export function AuthProvider({
  children,
  requireEmailVerification = false,
  redirectAfterSignIn = '/dashboard',
  redirectAfterSignOut = '/'
}: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Check for redirect result on mount (for social logins)
  useEffect(() => {
    checkRedirectResult().then(result => {
      if (result?.user) {
        router.push(redirectAfterSignIn);
      }
    }).catch(console.error);
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    let unsubscribeAuth: Unsubscribe | undefined;
    let unsubscribeProfile: FirestoreUnsubscribe | undefined;

    const setupAuthListener = async () => {
      try {
        unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          console.log('Auth state changed:', firebaseUser?.uid);

          if (firebaseUser) {
            // Cast to AuthUser
            const authUser = firebaseUser as AuthUser;
            setUser(authUser);

            // Set up profile listener
            if (!unsubscribeProfile) {
              const profileRef = doc(db, 'users', firebaseUser.uid);
              unsubscribeProfile = onSnapshot(
                profileRef,
                (doc) => {
                  if (doc.exists()) {
                    const profileData = doc.data() as UserProfile;
                    setProfile(profileData);

                    // Attach profile to user object
                    authUser.profile = profileData;
                    setUser({ ...authUser });
                  }
                },
                (error) => {
                  console.error('Profile listener error:', error);
                }
              );
            }

            // Check email verification requirement
            if (requireEmailVerification && !firebaseUser.emailVerified) {
              // Redirect to verification page
              if (pathname !== '/auth/verify-email') {
                router.push('/auth/verify-email');
              }
            }
          } else {
            // User signed out
            setUser(null);
            setProfile(null);

            // Clean up profile listener
            if (unsubscribeProfile) {
              unsubscribeProfile();
              unsubscribeProfile = undefined;
            }
          }

          setLoading(false);
          setAuthInitialized(true);
        });
      } catch (error) {
        console.error('Auth initialization error:', error);
        setError(error as AuthError);
        setLoading(false);
        setAuthInitialized(true);
      }
    };

    setupAuthListener();

    // Cleanup
    return () => {
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [requireEmailVerification, router, pathname]);

  // Auth methods with error handling
  const handleSignInWithGoogle = useCallback(async (useRedirect = false) => {
    setError(null);
    try {
      const result = await signInWithGoogle(useRedirect);

      // Domain check after Google sign-in
      if (result?.user?.email && !isAllowedDomain(result.user.email)) {
        await firebaseSignOut();
        const authError = new Error('Access restricted to @google.com and @altostrat.com emails') as AuthError;
        setError(authError);
        throw authError;
      }

      if (result?.user && !useRedirect) {
        router.push(redirectAfterSignIn);
      }
      return result;
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, [router, redirectAfterSignIn]);

  const handleSignInWithGitHub = useCallback(async (useRedirect = false) => {
    setError(null);
    try {
      const result = await signInWithGitHub(useRedirect);

      // Domain check after GitHub sign-in
      if (result?.user?.email && !isAllowedDomain(result.user.email)) {
        await firebaseSignOut();
        const authError = new Error('Access restricted to @google.com and @altostrat.com emails') as AuthError;
        setError(authError);
        throw authError;
      }

      if (result?.user && !useRedirect) {
        router.push(redirectAfterSignIn);
      }
      return result;
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, [router, redirectAfterSignIn]);

  const handleSignInWithEmail = useCallback(async (
    email: string,
    password: string,
    remember = true
  ) => {
    setError(null);

    // Domain check before sign-in
    if (!isAllowedDomain(email)) {
      const authError = new Error('Access restricted to @google.com and @altostrat.com emails') as AuthError;
      setError(authError);
      throw authError;
    }

    try {
      await setAuthPersistence(remember);
      const result = await signInWithEmail(email, password);
      if (result.user) {
        router.push(redirectAfterSignIn);
      }
      return result;
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, [router, redirectAfterSignIn]);

  const handleSignUpWithEmail = useCallback(async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    setError(null);

    // Domain check before sign-up
    if (!isAllowedDomain(email)) {
      const authError = new Error('Access restricted to @google.com and @altostrat.com emails') as AuthError;
      setError(authError);
      throw authError;
    }

    try {
      const result = await signUpWithEmail(email, password, displayName);
      if (result.user) {
        if (requireEmailVerification) {
          router.push('/auth/verify-email');
        } else {
          router.push(redirectAfterSignIn);
        }
      }
      return result;
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, [router, redirectAfterSignIn, requireEmailVerification]);

  const handleSignOut = useCallback(async () => {
    setError(null);
    try {
      await firebaseSignOut();
      router.push(redirectAfterSignOut);
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, [router, redirectAfterSignOut]);

  const handleResetPassword = useCallback(async (email: string) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, []);

  const handleUpdateProfile = useCallback(async (updates: {
    displayName?: string;
    photoURL?: string;
  }) => {
    setError(null);
    try {
      await updateUserProfile(updates);
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, []);

  const handleGetIdToken = useCallback(async (forceRefresh = false) => {
    try {
      return await getIdToken(forceRefresh);
    } catch (error) {
      console.error('Failed to get ID token:', error);
      return null;
    }
  }, []);

  const handleGetIdTokenResult = useCallback(async (forceRefresh = false) => {
    try {
      return await getIdTokenResult(forceRefresh);
    } catch (error) {
      console.error('Failed to get ID token result:', error);
      return null;
    }
  }, []);

  const handleResendVerificationEmail = useCallback(async () => {
    setError(null);
    try {
      await resendEmailVerification();
    } catch (error) {
      const authError = error as AuthError;
      setError(authError);
      throw authError;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setRememberMe = useCallback(async (remember: boolean) => {
    try {
      await setAuthPersistence(remember);
    } catch (error) {
      console.error('Failed to set persistence:', error);
    }
  }, []);

  // Memoized context value
  const contextValue = useMemo<AuthContextState>(() => ({
    user,
    profile,
    loading,
    error,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithGitHub: handleSignInWithGitHub,
    signInWithEmail: handleSignInWithEmail,
    signUpWithEmail: handleSignUpWithEmail,
    signOut: handleSignOut,
    resetPassword: handleResetPassword,
    updateProfile: handleUpdateProfile,
    getIdToken: handleGetIdToken,
    getIdTokenResult: handleGetIdTokenResult,
    isEmailVerified,
    resendVerificationEmail: handleResendVerificationEmail,
    clearError,
    setRememberMe
  }), [
    user,
    profile,
    loading,
    error,
    handleSignInWithGoogle,
    handleSignInWithGitHub,
    handleSignInWithEmail,
    handleSignUpWithEmail,
    handleSignOut,
    handleResetPassword,
    handleUpdateProfile,
    handleGetIdToken,
    handleGetIdTokenResult,
    handleResendVerificationEmail,
    clearError,
    setRememberMe
  ]);

  // Don't render children until auth is initialized
  if (!authInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-green-500 font-mono text-sm">
          <span className="animate-pulse">Initializing auth system...</span>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to require authentication
 */
export function useRequireAuth(redirectTo = '/auth/login') {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== redirectTo) {
      router.push(`${redirectTo}?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, router, pathname, redirectTo]);

  return { user, loading };
}