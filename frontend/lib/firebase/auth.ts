import {
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  confirmPasswordReset,
  sendEmailVerification,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  GithubAuthProvider,
  User,
  UserCredential,
  AuthError,
  NextOrObserver,
  getRedirectResult,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  Unsubscribe,
  IdTokenResult
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, authConfig } from './config';

/**
 * User profile interface stored in Firestore
 */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: any; // Firestore timestamp
  updatedAt: any; // Firestore timestamp
  lastLoginAt: any; // Firestore timestamp
  emailVerified: boolean;
  role?: 'user' | 'admin';
  provider?: 'email' | 'google' | 'github'; // Added provider field
  githubUsername?: string; // Added GitHub username field
  preferences?: {
    theme?: 'light' | 'dark' | 'system';
    notifications?: boolean;
  };
}

/**
 * Extended auth user with profile data
 */
export interface AuthUser extends User {
  profile?: UserProfile;
}

/**
 * Auth state interface for tracking authentication status
 */
export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: AuthError | null;
}

// Token refresh manager
class TokenManager {
  private refreshTimer: NodeJS.Timeout | null = null;

  /**
   * Start automatic token refresh
   */
  startTokenRefresh(user: User) {
    this.stopTokenRefresh();

    // Refresh token before expiry
    this.refreshTimer = setInterval(async () => {
      try {
        await user.getIdToken(true); // Force refresh
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, authConfig.tokenRefreshInterval);
  }

  /**
   * Stop token refresh timer
   */
  stopTokenRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

const tokenManager = new TokenManager();

/**
 * Initialize or update user profile in Firestore
 */
async function upsertUserProfile(
  user: User, 
  additionalData?: { provider?: string; githubUsername?: string }
): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);

  try {
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // Update existing profile
      const updates = {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
        ...(additionalData && additionalData)
      };

      await updateDoc(userRef, updates);

      return {
        ...userSnap.data(),
        ...updates
      } as UserProfile;
    } else {

      const baseProfile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        role: 'user' as const,
        preferences: {
          theme: 'system' as const,
          notifications: true
        }
      };
      // Create new profile
      const newProfile: UserProfile = additionalData 
        ? {
            ...baseProfile,
            ...additionalData,
            // Override provider to ensure correct type
            provider: additionalData.provider 
              ? (additionalData.provider as 'email' | 'google' | 'github')
              : undefined
          }
        : baseProfile;

      await setDoc(userRef, newProfile);
      return newProfile;
    }
  } catch (error) {
    console.error('Error upserting user profile:', error);
    throw error;
  }
}

/**
 * Google OAuth provider instance
 */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters(authConfig.providers.google.customParameters);
authConfig.providers.google.scopes.forEach(scope => {
  googleProvider.addScope(scope);
});

/**
 * GitHub OAuth provider instance
 */
const githubProvider = new GithubAuthProvider();
githubProvider.addScope('read:user');
githubProvider.addScope('user:email');

/**
 * Sign in with Google using popup
 */
export async function signInWithGoogle(useRedirect = false): Promise<UserCredential | null> {
  try {
    let result: UserCredential | null;

    if (useRedirect) {
      await signInWithRedirect(auth, googleProvider);
      result = await getRedirectResult(auth);
    } else {
      result = await signInWithPopup(auth, googleProvider);
    }

    if (result?.user) {
      await upsertUserProfile(result.user, { provider: 'google' });
      tokenManager.startTokenRefresh(result.user);
    }

    return result;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
}

/**
 * Sign in with GitHub using popup or redirect
 */
export async function signInWithGitHub(useRedirect = false): Promise<UserCredential | null> {
  try {
    let result: UserCredential | null = null;

    if (useRedirect) {
      await signInWithRedirect(auth, githubProvider);
      // Redirect result will be handled by checkRedirectResult
      return null;
    } else {
      result = await signInWithPopup(auth, githubProvider);
    }

    if (result?.user) {
      // Extract GitHub username from additional user info
      const githubUsername = (result as any)._tokenResponse?.screenName || 
                            result.user.displayName?.toLowerCase().replace(/\s+/g, '') || 
                            '';

      await upsertUserProfile(result.user, { 
        provider: 'github',
        githubUsername 
      });
      tokenManager.startTokenRefresh(result.user);
    }

    return result;
  } catch (error) {
    console.error('GitHub sign-in error:', error);
    throw error;
  }
}

/**
 * Check for redirect result from any provider
 */
export async function checkRedirectResult(): Promise<UserCredential | null> {
  try {
    const result = await getRedirectResult(auth);

    if (result?.user) {
      // Determine provider from result
      const providerId = result.providerId || 
                        result.user.providerData[0]?.providerId || 
                        'unknown';

      const provider = providerId.includes('github') ? 'github' : 
                      providerId.includes('google') ? 'google' : 
                      'email';

      // Get GitHub username if GitHub provider
      const githubUsername = provider === 'github' ? 
        (result as any)._tokenResponse?.screenName || 
        result.user.displayName?.toLowerCase().replace(/\s+/g, '') || '' : 
        undefined;

      await upsertUserProfile(result.user, {
        provider,
        ...(githubUsername && { githubUsername })
      });
      
      tokenManager.startTokenRefresh(result.user);
      return result;
    }

    return null;
  } catch (error) {
    console.error('Redirect result error:', error);
    return null;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);

    if (result.user) {
      await upsertUserProfile(result.user, { provider: 'email' });
      tokenManager.startTokenRefresh(result.user);
    }

    return result;
  } catch (error) {
    console.error('Email sign-in error:', error);
    throw error;
  }
}

/**
 * Create new account with email and password
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserCredential> {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    if (result.user) {
      // Update display name if provided
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }

      // Send verification email
      await sendEmailVerification(result.user);

      // Create user profile
      await upsertUserProfile(result.user, { provider: 'email' });
      tokenManager.startTokenRefresh(result.user);
    }

    return result;
  } catch (error) {
    console.error('Email sign-up error:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  try {
    tokenManager.stopTokenRefresh();
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign-out error:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Password reset error:', error);
    throw error;
  }
}

/**
 * Confirm password reset with code
 */
export async function confirmPasswordResetWithCode(code: string, newPassword: string): Promise<void> {
  try {
    await confirmPasswordReset(auth, code, newPassword);
  } catch (error) {
    console.error('Password reset confirmation error:', error);
    throw error;
  }
}

/**
 * Update user profile information
 */
export async function updateUserProfile(updates: {
  displayName?: string;
  photoURL?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');

  try {
    await updateProfile(user, updates);

    // Update Firestore profile
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Profile update error:', error);
    throw error;
  }
}

/**
 * Get current user's ID token
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    console.error('Failed to get ID token:', error);
    return null;
  }
}

/**
 * Get current user's ID token result with claims
 */
export async function getIdTokenResult(forceRefresh = false): Promise<IdTokenResult | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    return await user.getIdTokenResult(forceRefresh);
  } catch (error) {
    console.error('Failed to get ID token result:', error);
    return null;
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: NextOrObserver<User | null>): Unsubscribe {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      tokenManager.startTokenRefresh(user);

      // Attach profile to user object
      try {
        const profile = await upsertUserProfile(user);
        const authUser = user as AuthUser;
        authUser.profile = profile;

        if (typeof callback === 'function') {
          callback(authUser);
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
        if (typeof callback === 'function') {
          callback(user);
        }
      }
    } else {
      tokenManager.stopTokenRefresh();
      if (typeof callback === 'function') {
        callback(null);
      }
    }
  });
}

/**
 * Set auth persistence
 */
export async function setAuthPersistence(remember: boolean): Promise<void> {
  try {
    await setPersistence(
      auth,
      remember ? browserLocalPersistence : browserSessionPersistence
    );
  } catch (error) {
    console.error('Failed to set persistence:', error);
    throw error;
  }
}

/**
 * Get formatted error message
 */
export function getAuthErrorMessage(error: AuthError): string {
  const code = error.code as keyof typeof authConfig.errorMessages;
  return authConfig.errorMessages[code] || authConfig.errorMessages.default;
}

/**
 * Check if user email is verified
 */
export function isEmailVerified(): boolean {
  return auth.currentUser?.emailVerified || false;
}

/**
 * Resend email verification
 */
export async function resendEmailVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');

  try {
    await sendEmailVerification(user);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw error;
  }
}

// Export auth instance and types
export { auth };
export type { User, UserCredential, AuthError };