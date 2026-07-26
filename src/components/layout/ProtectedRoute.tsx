import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from './AppShell';

export function ProtectedRoute() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    // Redirect to landing page (or a login page) if not authenticated
    return <Navigate to="/" replace />;
  }

  return <AppShell />;
}
