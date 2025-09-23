'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  AuthError,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
  reload
} from 'firebase/auth';
import { doc, onSnapshot, Unsubscribe as FirestoreUnsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { UserProfile, getIdToken } from '@/lib/firebase/auth';

interface UseAuthReturn {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: AuthError | null;

  // Auth methods
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (updates: { displayName?: string; photoURL?: string }) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<void>;

  // Token methods
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;

  // Utility methods
  clearError: () => void;
  isEmailVerified: boolean;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [tokenRefreshTimer, setTokenRefreshTimer] = useState<NodeJS.Timeout | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
      }
    };
  }, [tokenRefreshTimer]);

  // Listen to auth state changes
  useEffect(() => {
    setLoading(true);

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        // Set up token refresh
        const timer = setInterval(async () => {
          try {
            await firebaseUser.getIdToken(true);
          } catch (err) {
            console.error('Token refresh failed:', err);
          }
        }, 50 * 60 * 1000); // Refresh every 50 minutes

        setTokenRefreshTimer(timer);
      } else {
        setUser(null);
        setProfile(null);

        // Clear token refresh timer
        if (tokenRefreshTimer) {
          clearInterval(tokenRefreshTimer);
          setTokenRefreshTimer(null);
        }
      }

      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Listen to profile changes
  useEffect(() => {
    let unsubscribeProfile: FirestoreUnsubscribe | undefined;

    if (user) {
      const profileRef = doc(db, 'users', user.uid);
      unsubscribeProfile = onSnapshot(
        profileRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setProfile(snapshot.data() as UserProfile);
          } else {
            setProfile(null);
          }
        },
        (err) => {
          console.error('Profile listener error:', err);
          setProfile(null);
        }
      );
    } else {
      setProfile(null);
    }

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [user]);

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auth methods
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err as AuthError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    setError(null);
    setLoading(true);

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }

      if (result.user) {
        await sendEmailVerification(result.user);
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err as AuthError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const signOut = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      await firebaseSignOut(auth);
      router.push('/');
    } catch (err) {
      setError(err as AuthError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const resetPassword = useCallback(async (email: string) => {
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      setError(err as AuthError);
      throw err;
    }
  }, []);

  const updateUserProfile = useCallback(async (updates: {
    displayName?: string;
    photoURL?: string;
  }) => {
    if (!user) throw new Error('No user logged in');

    setError(null);

    try {
      await updateProfile(user, updates);
      await reload(user);
    } catch (err) {
      setError(err as AuthError);
      throw err;
    }
  }, [user]);

  const sendVerificationEmail = useCallback(async () => {
    if (!user) throw new Error('No user logged in');

    setError(null);

    try {
      await sendEmailVerification(user);
    } catch (err) {
      setError(err as AuthError);
      throw err;
    }
  }, [user]);

  const reloadUser = useCallback(async () => {
    if (!user) return;

    try {
      await reload(user);
    } catch (err) {
      console.error('Failed to reload user:', err);
    }
  }, [user]);

  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    if (!user) return null;

    try {
      return await getIdToken(forceRefresh);
    } catch (err) {
      console.error('Failed to get access token:', err);
      return null;
    }
  }, [user]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isEmailVerified = useMemo(() => {
    return user?.emailVerified || false;
  }, [user]);

  return {
    user,
    profile,
    loading,
    error,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    updateUserProfile,
    sendVerificationEmail,
    reloadUser,
    getAccessToken,
    clearError,
    isEmailVerified
  };
}