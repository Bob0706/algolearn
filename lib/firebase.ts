// lib/firebase.ts — Firebase auth + Firestore, with an explicit local DEMO mode.
//
// When NEXT_PUBLIC_FIREBASE_* is not configured the app runs in demo mode: a local
// "Demo Trader" account whose data lives in this browser's localStorage. Demo mode
// is never entered silently when Firebase IS configured — sign-in errors are shown.

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  Auth, getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut,
} from "firebase/auth";
import {
  Firestore, addDoc, arrayUnion, collection, doc, getDoc, getDocs, getFirestore, increment, query,
  serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";

export const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== "your_firebase_api_key",
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
  db = getFirestore(app);
}

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isDemo: boolean;
}

export interface SimulatorStats { sessions: number; totalTrades: number; wins: number; losses: number; totalPnL: number }

export interface UserDoc {
  uid: string;
  displayName: string | null;
  lessonsCompleted: string[];
  simulatorStats: SimulatorStats;
}

export interface SavedStrategy {
  id: string;
  uid: string;
  name: string;
  description: string;
  code: string;
  symbol?: string;
  backtestResult?: Record<string, unknown>;
  ledgerId?: string;
  createdAt: string | number | { seconds: number };
}

const EMPTY_STATS: SimulatorStats = { sessions: 0, totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 };

// ─── demo-mode storage ─────────────────────────────────────────────────────
const DEMO_USER: AppUser = { uid: "demo-trader", displayName: "Demo Trader", email: null, photoURL: null, isDemo: true };
const LS_SESSION = "algolearn_demo_session";
const lsKey = (uid: string, what: string) => `algolearn_${what}_${uid}`;

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

let demoSubscribers: ((u: AppUser | null) => void)[] = [];

// ─── auth ───────────────────────────────────────────────────────────────────
const toAppUser = (u: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): AppUser => ({
  uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL, isDemo: false,
});

export async function signInWithGoogle(): Promise<AppUser> {
  if (auth) {
    const result = await signInWithPopup(auth, new GoogleAuthProvider()); // errors propagate to the UI
    const user = toAppUser(result.user);
    await createUserDocIfNotExists(user);
    return user;
  }
  lsSet(LS_SESSION, true);
  demoSubscribers.forEach(cb => cb(DEMO_USER));
  return DEMO_USER;
}

export async function signOut(): Promise<void> {
  if (auth) await firebaseSignOut(auth);
  if (typeof window !== "undefined") localStorage.removeItem(LS_SESSION);
  demoSubscribers.forEach(cb => cb(null));
}

export function onAuthChange(callback: (user: AppUser | null) => void): () => void {
  if (auth) return onAuthStateChanged(auth, u => callback(u ? toAppUser(u) : null));
  demoSubscribers.push(callback);
  callback(lsGet(LS_SESSION, false) ? DEMO_USER : null);
  return () => { demoSubscribers = demoSubscribers.filter(cb => cb !== callback); };
}

/** Firebase ID token for API calls (lets the server attribute ledger records). */
export async function getIdToken(): Promise<string | null> {
  try {
    return (await auth?.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

// ─── user document ────────────────────────────────────────────────────────
export async function createUserDocIfNotExists(user: AppUser) {
  if (!db || user.isDemo) return;
  const ref = doc(db, "users", user.uid);
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, {
      uid: user.uid, displayName: user.displayName, createdAt: serverTimestamp(),
      lessonsCompleted: [], simulatorStats: EMPTY_STATS,
    });
  }
}

export async function getUserDoc(user: AppUser): Promise<UserDoc> {
  const fallback: UserDoc = { uid: user.uid, displayName: user.displayName, lessonsCompleted: [], simulatorStats: EMPTY_STATS };
  if (db && !user.isDemo) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return fallback;
    const d = snap.data() as Partial<UserDoc>;
    return { ...fallback, ...d, simulatorStats: { ...EMPTY_STATS, ...(d.simulatorStats ?? {}) } };
  }
  return { ...fallback, ...lsGet<Partial<UserDoc>>(lsKey(user.uid, "user"), {}) };
}

export async function markLessonComplete(user: AppUser, lessonId: string) {
  if (db && !user.isDemo) {
    await updateDoc(doc(db, "users", user.uid), { lessonsCompleted: arrayUnion(lessonId) });
    return;
  }
  const d = await getUserDoc(user);
  if (!d.lessonsCompleted.includes(lessonId)) {
    lsSet(lsKey(user.uid, "user"), { ...d, lessonsCompleted: [...d.lessonsCompleted, lessonId] });
  }
}

/** Adds one finished session to the running totals (previously each session overwrote the last). */
export async function addSimulatorSession(user: AppUser, s: { trades: number; wins: number; losses: number; pnl: number }) {
  if (db && !user.isDemo) {
    await updateDoc(doc(db, "users", user.uid), {
      "simulatorStats.sessions": increment(1),
      "simulatorStats.totalTrades": increment(s.trades),
      "simulatorStats.wins": increment(s.wins),
      "simulatorStats.losses": increment(s.losses),
      "simulatorStats.totalPnL": increment(s.pnl),
    });
    return;
  }
  const d = await getUserDoc(user);
  const st = d.simulatorStats;
  lsSet(lsKey(user.uid, "user"), {
    ...d,
    simulatorStats: {
      sessions: st.sessions + 1, totalTrades: st.totalTrades + s.trades, wins: st.wins + s.wins,
      losses: st.losses + s.losses, totalPnL: st.totalPnL + s.pnl,
    },
  });
}

// ─── strategies ──────────────────────────────────────────────────────────
export async function saveStrategy(user: AppUser, strategy: Omit<SavedStrategy, "id" | "uid" | "createdAt">) {
  if (db && !user.isDemo) {
    const ref = await addDoc(collection(db, "strategies"), { ...strategy, uid: user.uid, createdAt: serverTimestamp() });
    return ref.id;
  }
  const list = lsGet<SavedStrategy[]>(lsKey(user.uid, "strategies"), []);
  const id = `strat_${Date.now()}`;
  list.unshift({ ...strategy, id, uid: user.uid, createdAt: Date.now() });
  lsSet(lsKey(user.uid, "strategies"), list);
  return id;
}

export async function getUserStrategies(user: AppUser): Promise<SavedStrategy[]> {
  if (db && !user.isDemo) {
    // Sort client-side: where()+orderBy() on different fields needs a composite index.
    const snap = await getDocs(query(collection(db, "strategies"), where("uid", "==", user.uid)));
    const seconds = (c: SavedStrategy["createdAt"]) => (typeof c === "object" && c ? c.seconds : Number(c) / 1000 || 0);
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<SavedStrategy, "id">) }))
      .sort((a, b) => seconds(b.createdAt) - seconds(a.createdAt));
  }
  return lsGet<SavedStrategy[]>(lsKey(user.uid, "strategies"), []);
}
