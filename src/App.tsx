import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Bins } from '@/pages/Bins';
import { MapView } from '@/pages/Map';
import { Analytics } from '@/pages/Analytics';
import { Settings } from '@/pages/Settings';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/bins" element={<Bins />} />
        <Route path="/trucks" element={<div className="p-4 animate-fade-in"><h1 className="text-3xl font-display font-bold">Fleet Management</h1><p className="text-muted-foreground mt-4">Module currently in beta.</p></div>} />
        <Route path="/alerts" element={<div className="p-4 animate-fade-in"><h1 className="text-3xl font-display font-bold">System Alerts</h1><p className="text-muted-foreground mt-4">Module currently in beta.</p></div>} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/users" element={<div className="p-4 animate-fade-in"><h1 className="text-3xl font-display font-bold">User Access</h1><p className="text-muted-foreground mt-4">Module currently in beta.</p></div>} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
