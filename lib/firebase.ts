// lib/firebase.ts — Firebase initialization with local storage fallback

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

// ─── Firebase Config ──────────────────────────────────────────────────────────
const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== "your_firebase_api_key"
);

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDemoFallbackKeyForPreview001",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "algolearn-preview.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "algolearn-preview",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "algolearn-preview.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789012:web:demoapplet001",
};

let app: FirebaseApp;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.warn("[Firebase] Initialization warning, using fallback:", e);
  app = getApps()[0] || initializeApp(firebaseConfig, "fallback");
}

export const auth = getAuth(app);
export const db = getFirestore(app);

// ─── Local Mock Fallback Storage Helpers ────────────────────────────────────
const LOCAL_USER_KEY = "algolearn_mock_user";
const LOCAL_STRATEGIES_KEY = "algolearn_mock_strategies";
const LOCAL_USER_DATA_KEY = "algolearn_mock_user_data";

let authSubscribers: ((user: any | null) => void)[] = [];

// Demo guest user
const DEMO_USER = {
  uid: "demo-trader-01",
  displayName: "Algo Trader",
  email: "trader@algolearn.in",
  photoURL: null,
};

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<any> {
  if (isFirebaseConfigured) {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await createUserDocIfNotExists(result.user);
      return result.user;
    } catch (err) {
      console.warn("[Firebase] Popup sign-in error, activating demo user session:", err);
    }
  }

  // Fallback demo user
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(DEMO_USER));
  }
  authSubscribers.forEach(cb => cb(DEMO_USER));
  await createUserDocIfNotExists(DEMO_USER as any);
  return DEMO_USER;
}

export async function signOut(): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      await firebaseSignOut(auth);
    } catch {}
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem(LOCAL_USER_KEY);
  }
  authSubscribers.forEach(cb => cb(null));
}

export function onAuthChange(callback: (user: any | null) => void) {
  authSubscribers.push(callback);

  // Check local storage demo user first if available
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(LOCAL_USER_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        callback(parsed);
      } catch {}
    }
  }

  if (isFirebaseConfigured) {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        callback(firebaseUser);
      } else {
        const stored = typeof window !== "undefined" ? localStorage.getItem(LOCAL_USER_KEY) : null;
        callback(stored ? JSON.parse(stored) : null);
      }
    });
  }

  return () => {
    authSubscribers = authSubscribers.filter(cb => cb !== callback);
  };
}

// ─── Firestore / Persistence Helpers ─────────────────────────────────────────

export async function createUserDocIfNotExists(user: any) {
  if (isFirebaseConfigured) {
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          lessonsCompleted: [],
          simulatorStats: { totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 },
        });
      }
      return;
    } catch (e) {
      console.warn("[Firebase] createUserDocIfNotExists fallback:", e);
    }
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const existing = localStorage.getItem(LOCAL_USER_DATA_KEY);
    if (!existing) {
      const initial = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lessonsCompleted: ["l1"],
        simulatorStats: { totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 },
      };
      localStorage.setItem(LOCAL_USER_DATA_KEY, JSON.stringify(initial));
    }
  }
}

export async function getUserDoc(uid: string) {
  if (isFirebaseConfigured) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) return snap.data();
    } catch (e) {
      console.warn("[Firebase] getUserDoc fallback:", e);
    }
  }

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(LOCAL_USER_DATA_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {}
    }
    return {
      uid,
      displayName: "Algo Trader",
      email: "trader@algolearn.in",
      lessonsCompleted: ["l1"],
      simulatorStats: { totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 },
    };
  }
  return null;
}

export async function saveStrategy(uid: string, strategy: {
  name: string;
  description: string;
  code: string;
  symbol?: string;
  backtestResult?: unknown;
}) {
  if (isFirebaseConfigured) {
    try {
      return await addDoc(collection(db, "strategies"), {
        ...strategy,
        uid,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[Firebase] saveStrategy fallback:", e);
    }
  }

  if (typeof window !== "undefined") {
    const key = `${LOCAL_STRATEGIES_KEY}_${uid}`;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const newEntry = {
      id: `strat_${Date.now()}`,
      ...strategy,
      uid,
      createdAt: new Date().toISOString(),
    };
    list.unshift(newEntry);
    localStorage.setItem(key, JSON.stringify(list));
    return newEntry;
  }
}

export async function getUserStrategies(uid: string) {
  if (isFirebaseConfigured) {
    try {
      const q = query(
        collection(db, "strategies"),
        where("uid", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn("[Firebase] getUserStrategies fallback:", e);
    }
  }

  if (typeof window !== "undefined") {
    const key = `${LOCAL_STRATEGIES_KEY}_${uid}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
  }
  return [];
}

export async function markLessonComplete(uid: string, lessonId: string) {
  if (isFirebaseConfigured) {
    try {
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        const completed: string[] = data.lessonsCompleted || [];
        if (!completed.includes(lessonId)) {
          await updateDoc(userRef, { lessonsCompleted: [...completed, lessonId] });
        }
      }
      return;
    } catch (e) {
      console.warn("[Firebase] markLessonComplete fallback:", e);
    }
  }

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(LOCAL_USER_DATA_KEY);
    const data = stored ? JSON.parse(stored) : { uid, lessonsCompleted: [] };
    const completed: string[] = data.lessonsCompleted || [];
    if (!completed.includes(lessonId)) {
      data.lessonsCompleted = [...completed, lessonId];
      localStorage.setItem(LOCAL_USER_DATA_KEY, JSON.stringify(data));
    }
  }
}

export async function updateSimulatorStats(uid: string, stats: {
  totalTrades: number; wins: number; losses: number; totalPnL: number;
}) {
  if (isFirebaseConfigured) {
    try {
      await updateDoc(doc(db, "users", uid), { simulatorStats: stats });
      return;
    } catch (e) {
      console.warn("[Firebase] updateSimulatorStats fallback:", e);
    }
  }

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(LOCAL_USER_DATA_KEY);
    const data = stored ? JSON.parse(stored) : { uid };
    data.simulatorStats = stats;
    localStorage.setItem(LOCAL_USER_DATA_KEY, JSON.stringify(data));
  }
}
