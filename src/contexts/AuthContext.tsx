import { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signOut } from 'firebase/auth';
import { ref as dbRef, set as dbSet } from 'firebase/database';
import { auth, db, IS_DEMO_MODE } from '@/lib/firebase';

interface UserProfileData {
  organization?: string;
  role?: string;
  phone?: string;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string, profile?: UserProfileData) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (IS_DEMO_MODE) {
      return {
        uid: 'demo-admin',
        email: 'admin@smartbin.io',
        displayName: 'Demo Admin',
      } as User;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => !IS_DEMO_MODE);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, pass: string) => {
    if (IS_DEMO_MODE) return;
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const register = async (email: string, pass: string, name: string, profile?: UserProfileData) => {
    if (IS_DEMO_MODE) return;
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCredential.user, { displayName: name });

    // Save extended profile data to Realtime Database
    const uid = userCredential.user.uid;
    await dbSet(dbRef(db, `users/${uid}`), {
      uid,
      email,
      displayName: name,
      organization: profile?.organization || '',
      role: profile?.role || 'user',
      phone: profile?.phone || '',
      createdAt: Date.now(),
      lastLogin: Date.now(),
    });

    setCurrentUser(auth.currentUser);
  };

  const resetPassword = async (email: string) => {
    if (IS_DEMO_MODE) return;
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    if (IS_DEMO_MODE) {
      setCurrentUser(null);
      return;
    }
    await signOut(auth);
  };

  const value = {
    currentUser,
    loading,
    login,
    register,
    resetPassword,
    logout,
    isDemoMode: IS_DEMO_MODE
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
