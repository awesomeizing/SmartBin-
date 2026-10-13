import { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signOut } from 'firebase/auth';
import { ref as dbRef, set as dbSet } from 'firebase/database';
import { auth, db, IS_DEMO_MODE, IS_FIREBASE_CONFIGURED } from '@/lib/firebase';

interface UserProfileData { organization?: string; role?: string; phone?: string; }
interface AuthContextType { currentUser: User | null; loading: boolean; login: (email: string, pass: string) => Promise<void>; register: (email: string, pass: string, name: string, profile?: UserProfileData) => Promise<void>; resetPassword: (email: string) => Promise<void>; logout: () => Promise<void>; isDemoMode: boolean; }
const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within an AuthProvider'); return context; };

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DEMO_MODE || !IS_FIREBASE_CONFIGURED) {
      setCurrentUser({ uid: IS_DEMO_MODE ? 'demo-admin' : 'setup-admin', email: IS_DEMO_MODE ? 'admin@smartbin.io' : 'setup@smartbin.local', displayName: IS_DEMO_MODE ? 'Demo Admin' : 'SmartBin Setup' } as User);
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, user => { setCurrentUser(user); setLoading(false); });
  }, []);

  const login = async (email: string, pass: string) => { if (!IS_FIREBASE_CONFIGURED) return; await signInWithEmailAndPassword(auth, email, pass); };
  const register = async (email: string, pass: string, name: string, profile?: UserProfileData) => {
    if (!IS_FIREBASE_CONFIGURED) return;
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCredential.user, { displayName: name });
    const uid = userCredential.user.uid;
    await dbSet(dbRef(db, `users/${uid}`), { uid, email, displayName: name, organization: profile?.organization || '', role: profile?.role || 'user', phone: profile?.phone || '', createdAt: Date.now(), lastLogin: Date.now() });
    setCurrentUser(auth.currentUser);
  };
  const resetPassword = async (email: string) => { if (IS_FIREBASE_CONFIGURED) await sendPasswordResetEmail(auth, email); };
  const logout = async () => { if (IS_DEMO_MODE || !IS_FIREBASE_CONFIGURED) return; await signOut(auth); };

  return <AuthContext.Provider value={{ currentUser, loading, login, register, resetPassword, logout, isDemoMode: IS_DEMO_MODE }}>{!loading && children}</AuthContext.Provider>;
};
