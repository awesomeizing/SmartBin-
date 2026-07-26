/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { db, IS_DEMO_MODE } from '@/lib/firebase';
import { ref as dbRef, onValue as dbOnValue, set as dbSet, push as dbPush, remove as dbRemove, update as dbUpdate } from 'firebase/database';

// Demo Mock Data
const MOCK_BINS = {
  'bin1': { id: 'bin1', location: 'Downtown', fillLevel: 85, status: 'warning', lastCollection: '2026-07-25', battery: 80, capacity: 100 },
  'bin2': { id: 'bin2', location: 'Uptown', fillLevel: 20, status: 'healthy', lastCollection: '2026-07-26', battery: 95, capacity: 100 },
};

const MOCK_TRUCKS = {
  'truck1': { id: 'truck1', driver: 'John Doe', status: 'active', capacity: 5000, currentLoad: 1200 },
};

interface DatabaseContextType {
  bins: any;
  trucks: any;
  loading: boolean;
  addBin: (bin: any) => Promise<void>;
  updateBin: (id: string, bin: any) => Promise<void>;
  deleteBin: (id: string) => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error('useDatabase must be used within a DatabaseProvider');
  return context;
};

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [bins, setBins] = useState<any>(null);
  const [trucks, setTrucks] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setBins(MOCK_BINS);
      setTrucks(MOCK_TRUCKS);
      setLoading(false);
      return;
    }

    const binsRef = dbRef(db, 'bins');
    const unsubscribeBins = dbOnValue(binsRef, (snapshot) => {
      setBins(snapshot.val() || {});
      setLoading(false);
    });

    const trucksRef = dbRef(db, 'trucks');
    const unsubscribeTrucks = dbOnValue(trucksRef, (snapshot) => {
      setTrucks(snapshot.val() || {});
    });

    return () => {
      unsubscribeBins();
      unsubscribeTrucks();
    };
  }, []);

  const addBin = async (bin: any) => {
    if (IS_DEMO_MODE) return;
    const newRef = dbPush(dbRef(db, 'bins'));
    await dbSet(newRef, bin);
  };

  const updateBin = async (id: string, bin: any) => {
    if (IS_DEMO_MODE) return;
    await dbUpdate(dbRef(db, `bins/${id}`), bin);
  };

  const deleteBin = async (id: string) => {
    if (IS_DEMO_MODE) return;
    await dbRemove(dbRef(db, `bins/${id}`));
  };

  const value = { bins, trucks, loading, addBin, updateBin, deleteBin };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};
