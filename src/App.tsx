import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { Dashboard } from '@/pages/Dashboard';
import { Bins } from '@/pages/Bins';
import { MapView } from '@/pages/Map';
import { Analytics } from '@/pages/Analytics';
import { Settings } from '@/pages/Settings';
import { Alerts } from '@/pages/Alerts';
import { Trucks } from '@/pages/Trucks';
import { Notifications } from '@/pages/Notifications';
import { AIInsights } from '@/pages/AIInsights';
import { Reports } from '@/pages/Reports';
import { Admin } from '@/pages/Admin';
import { HardwareDashboard } from '@/pages/HardwareDashboard';
import { DeviceDetails } from '@/pages/DeviceDetails';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/bins" element={<Bins />} />
        <Route path="/trucks" element={<Trucks />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/ai" element={<AIInsights />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/hardware" element={<HardwareDashboard />} />
        <Route path="/hardware/:id" element={<DeviceDetails />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
