// ─────────────────────────────────────────────────────────────
// SmartBin+ Notification Context
// Global toast/notification system with auto-dismiss and severity.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AlertSeverity } from '@/types';
import { TOAST } from '@/constants';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  severity: AlertSeverity;
  duration?: number;
  createdAt: number;
}

interface NotificationContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useToast() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useToast must be used within a NotificationProvider');
  return context;
}

let toastCounter = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
    const id = `toast-${++toastCounter}`;
    const newToast: ToastItem = {
      ...toast,
      id,
      createdAt: Date.now(),
    };

    setToasts(prev => {
      // Keep max visible toasts
      const updated = [...prev, newToast];
      return updated.slice(-TOAST.MAX_VISIBLE);
    });

    // Auto-dismiss
    const duration = toast.duration ?? TOAST.DURATION_MS;
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}
