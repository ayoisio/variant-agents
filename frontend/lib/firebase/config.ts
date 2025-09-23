import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  connectAuthEmulator,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
  initializeFirestore
} from 'firebase/firestore';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';

/**
 * Firebase configuration object
 * All values come from environment variables for security
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate required configuration
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);

if (missingFields.length > 0) {
  throw new Error(
    `Missing required Firebase configuration: ${missingFields.join(', ')}. ` +
    'Please check your environment variables.'
  );
}

// Initialize Firebase only once
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let analytics: Analytics | null = null;

if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);

    // Initialize Auth with persistence
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error('Failed to set auth persistence:', error);
    });

    // Initialize Firestore with settings
    db = initializeFirestore(app, {
      experimentalForceLongPolling: false,
      cacheSizeBytes: 40 * 1024 * 1024 // 40MB cache
    });

    // Initialize Analytics only in production and if supported
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      isSupported().then(supported => {
        if (supported) {
          analytics = getAnalytics(app);
        }
      }).catch(console.error);
    }

    // Connect to emulators in development
    if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
      const authEmulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
      const firestoreEmulatorHost = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST || 'localhost:8080';

      try {
        connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
        const [host, port] = firestoreEmulatorHost.split(':');
        connectFirestoreEmulator(db, host, parseInt(port, 10));
        console.log('Connected to Firebase emulators');
      } catch (error) {
        // Emulators might already be connected
        console.warn('Emulator connection issue (may already be connected):', error);
      }
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
} else {
  app = getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
}

// Auth configuration
export const authConfig = {
  // Session configuration
  sessionTimeout: 60 * 60 * 1000, // 1 hour in milliseconds
  tokenRefreshInterval: 50 * 60 * 1000, // 50 minutes (refresh before 1-hour expiry)

  // OAuth providers configuration
  providers: {
    google: {
      scopes: ['email', 'profile'],
      customParameters: {
        prompt: 'select_account'
      }
    }
  },

  // Redirect URLs
  redirects: {
    signIn: '/dashboard',
    signOut: '/',
    error: '/auth/error',
    verifyEmail: '/auth/verify-email'
  },

  // Error messages
  errorMessages: {
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/email-already-in-use': 'An account already exists with this email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/unauthorized-domain': 'This domain is not authorized for sign-in.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled.',
    'default': 'An unexpected error occurred. Please try again.'
  }
};

// Export instances
export { app, auth, db, analytics };

// Type exports for use in other files
export type { FirebaseApp, Auth, Firestore, Analytics };