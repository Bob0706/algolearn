// lib/firebase.ts — Firebase initialization and auth helpers

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
  Timestamp,
} from "firebase/firestore";

// ─── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Prevent re-initialization in Next.js hot reload
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth = getAuth(app);
export const db   = getFirestore(app);

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await createUserDocIfNotExists(result.user);
  return result.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ─── Firestore Helpers ────────────────────────────────────────────────────────

/** Create user document on first sign-in */
export async function createUserDocIfNotExists(user: User) {
  const userRef = doc(db, "users", user.uid);
  const snap    = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid:         user.uid,
      displayName: user.displayName,
      email:       user.email,
      photoURL:    user.photoURL,
      createdAt:   serverTimestamp(),
      lessonsCompleted: [],
      simulatorStats: { totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 },
    });
  }
}

/** Fetch user document */
export async function getUserDoc(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/** Save a strategy to Firestore */
export async function saveStrategy(uid: string, strategy: {
  name: string;
  description: string;
  code: string;
  symbol?: string;
  backtestResult?: unknown;
}) {
  return addDoc(collection(db, "strategies"), {
    ...strategy,
    uid,
    createdAt: serverTimestamp(),
  });
}

/** Fetch all strategies for a user */
export async function getUserStrategies(uid: string) {
  const q = query(
    collection(db, "strategies"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Mark a lesson as completed */
export async function markLessonComplete(uid: string, lessonId: string) {
  const userRef = doc(db, "users", uid);
  const snap    = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    const completed: string[] = data.lessonsCompleted || [];
    if (!completed.includes(lessonId)) {
      await updateDoc(userRef, { lessonsCompleted: [...completed, lessonId] });
    }
  }
}

/** Update simulator stats */
export async function updateSimulatorStats(uid: string, stats: {
  totalTrades: number; wins: number; losses: number; totalPnL: number;
}) {
  await updateDoc(doc(db, "users", uid), { simulatorStats: stats });
}
