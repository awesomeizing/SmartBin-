import { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/contexts/NotificationContext';
import {
  User, Building2, Bell, Shield, Sliders,
  Cpu, Save
} from 'lucide-react';

export function Settings() {
  const { currentUser, isDemoMode } = useAuth();
  const { config } = useDatabase();
  const { addToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);
  const [emailDeliveryConfigured, setEmailDeliveryConfigured] = useState(false);
  const [verificationSending, setVerificationSending] = useState(false);

  // Mock settings state
  const [prefs, setPrefs] = useState({
    theme: 'system',
    language: 'en',
    units: 'metric',
    timezone: 'Asia/Kolkata',
  });

  const [notifications, setNotifications] = useState({
    binFull: true,
    sensorOffline: true,
    batteryLow: true,
    truckAssigned: false,
    collectionCompleted: true,
    emailAlerts: false,
    pushAlerts: true,
  });

  useEffect(() => {
    let active = true;
    if (isDemoMode || !currentUser) return;

    setEmailSettingsLoading(true);
    void (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/notification-settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load email settings.');
        if (active) {
          setNotifications((previous) => ({ ...previous, emailAlerts: result.emailAlerts === true }));
          setEmailDeliveryConfigured(result.emailDeliveryConfigured === true);
        }
      } catch (error) {
        if (active) addToast({
          title: 'Email settings unavailable',
          message: error instanceof Error ? error.message : 'Could not load notification settings.',
          severity: 'warning',
        });
      } finally {
        if (active) setEmailSettingsLoading(false);
      }
    })();

    return () => { active = false; };
  }, [currentUser, isDemoMode, addToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!isDemoMode && currentUser) {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/notification-settings', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ emailAlerts: notifications.emailAlerts }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to save email notification settings.');
      }
      addToast({
        title: isDemoMode ? 'Demo mode is active' : 'Settings saved',
        message: isDemoMode
          ? 'Connect Firebase to save account notification settings.'
          : 'Your email alert preference has been saved.',
        severity: 'info',
      });
    } catch (error) {
      addToast({
        title: 'Settings not saved',
        message: error instanceof Error ? error.message : 'Unable to save email notification settings.',
        severity: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendVerification = async () => {
    if (!currentUser) return;
    setVerificationSending(true);
    try {
      await sendEmailVerification(currentUser);
      addToast({ title: 'Verification email sent', message: `Check ${currentUser.email} and verify the address.`, severity: 'info' });
    } catch {
      addToast({ title: 'Could not send verification email', message: 'Check Firebase Authentication email settings and try again.', severity: 'warning' });
    } finally {
      setVerificationSending(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'company', label: 'Company', icon: <Building2 className="w-4 h-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Sliders className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'hardware', label: 'Hardware', icon: <Cpu className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Settings</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage your account, preferences, and system configuration.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="shadow-xl shadow-white/5 rounded-full px-6">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Tabs tabs={tabs} defaultTab="profile">
        {(activeTab) => {
          if (activeTab === 'profile') {
            return (
              <div className="space-y-6">
                <Card className="bg-white/[0.01] border-white/[0.05]">
                  <CardHeader className="border-b border-white/[0.05]">
                    <CardTitle className="text-base font-medium">Personal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="flex items-center gap-6">
                      <Avatar name={currentUser?.displayName ?? 'Admin'} size="lg" className="w-20 h-20 text-2xl" />
                      <div>
                        <Button variant="outline" size="sm">Change Photo</Button>
                        <p className="text-xs text-zinc-500 mt-2">JPG, GIF or PNG. Max size of 800K.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Full Name</label>
                        <Input defaultValue={currentUser?.displayName ?? ''} className="bg-white/[0.03]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Email Address</label>
                        <Input defaultValue={currentUser?.email ?? ''} type="email" className="bg-white/[0.03]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Phone Number</label>
                        <Input defaultValue="+91 98765 43210" type="tel" className="bg-white/[0.03]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Role</label>
                        <Input defaultValue="Administrator" disabled className="bg-white/[0.01] opacity-50 cursor-not-allowed" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          }

          if (activeTab === 'preferences') {
            return (
              <div className="space-y-6">
                <Card className="bg-white/[0.01] border-white/[0.05]">
                  <CardHeader className="border-b border-white/[0.05]">
                    <CardTitle className="text-base font-medium">Display & Regional</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Select
                        label="Theme"
                        value={prefs.theme}
                        onChange={(v) => setPrefs(prev => ({ ...prev, theme: v }))}
                        options={[
                          { value: 'dark', label: 'Dark (Default)' },
                          { value: 'light', label: 'Light' },
                          { value: 'system', label: 'System' },
                        ]}
                      />
                      <Select
                        label="Language"
                        value={prefs.language}
                        onChange={(v) => setPrefs(prev => ({ ...prev, language: v }))}
                        options={[
                          { value: 'en', label: 'English' },
                          { value: 'hi', label: 'Hindi' },
                          { value: 'kn', label: 'Kannada' },
                        ]}
                      />
                      <Select
                        label="Timezone"
                        value={prefs.timezone}
                        onChange={(v) => setPrefs(prev => ({ ...prev, timezone: v }))}
                        options={[
                          { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
                          { value: 'UTC', label: 'UTC' },
                        ]}
                      />
                      <Select
                        label="Units"
                        value={prefs.units}
                        onChange={(v) => setPrefs(prev => ({ ...prev, units: v }))}
                        options={[
                          { value: 'metric', label: 'Metric (km, kg, °C)' },
                          { value: 'imperial', label: 'Imperial (mi, lbs, °F)' },
                        ]}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          }

          if (activeTab === 'notifications') {
            return (
              <div className="space-y-6">
                <Card className="bg-white/[0.01] border-white/[0.05]">
                  <CardHeader className="border-b border-white/[0.05]">
                    <CardTitle className="text-base font-medium">Alert Channels</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <Switch
                      label="Email Notifications"
                      description={isDemoMode
                        ? 'Connect Firebase to enable email alerts.'
                        : !currentUser?.emailVerified
                          ? 'Verify your sign-in email before enabling alerts.'
                          : emailDeliveryConfigured
                            ? `Critical bin alerts and a telemetry CSV will be sent to ${currentUser.email}.`
                            : `Email delivery is not configured yet. Alerts will go to ${currentUser.email} after the server email provider is set up.`}
                      checked={notifications.emailAlerts}
                      onChange={(v) => setNotifications(prev => ({ ...prev, emailAlerts: v }))}
                      disabled={isDemoMode || emailSettingsLoading || !currentUser?.emailVerified}
                    />
                    {!isDemoMode && !currentUser?.emailVerified && (
                      <Button variant="outline" size="sm" onClick={handleSendVerification} disabled={verificationSending}>
                        {verificationSending ? 'Sending…' : 'Send verification email'}
                      </Button>
                    )}
                    {!isDemoMode && emailSettingsLoading && (
                      <p className="text-xs text-zinc-500">Loading saved email notification preference…</p>
                    )}
                    <Switch
                      label="Push Notifications"
                      description="Receive real-time alerts in your browser"
                      checked={notifications.pushAlerts}
                      onChange={(v) => setNotifications(prev => ({ ...prev, pushAlerts: v }))}
                    />
                  </CardContent>
                </Card>

                <Card className="bg-white/[0.01] border-white/[0.05]">
                  <CardHeader className="border-b border-white/[0.05]">
                    <CardTitle className="text-base font-medium">Event Triggers</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <Switch
                      label="Bin Full Alerts"
                      description={`Notify when any bin reaches ${config.defaultThresholdPct}% capacity`}
                      checked={notifications.binFull}
                      onChange={(v) => setNotifications(prev => ({ ...prev, binFull: v }))}
                    />
                    <Switch
                      label="Sensor Offline"
                      description="Notify if a hardware node stops responding"
                      checked={notifications.sensorOffline}
                      onChange={(v) => setNotifications(prev => ({ ...prev, sensorOffline: v }))}
                    />
                    <Switch
                      label="Low Battery"
                      description="Notify when a device battery drops below 20%"
                      checked={notifications.batteryLow}
                      onChange={(v) => setNotifications(prev => ({ ...prev, batteryLow: v }))}
                    />
                    <Switch
                      label="Collection Completed"
                      description="Notify when a truck finishes emptying a bin"
                      checked={notifications.collectionCompleted}
                      onChange={(v) => setNotifications(prev => ({ ...prev, collectionCompleted: v }))}
                    />
                  </CardContent>
                </Card>
              </div>
            );
          }

          if (activeTab === 'hardware') {
            return (
              <div className="space-y-6">
                <Card className="bg-white/[0.01] border-white/[0.05]">
                  <CardHeader className="border-b border-white/[0.05]">
                    <CardTitle className="text-base font-medium flex items-center justify-between">
                      Node Configuration
                      <Badge variant="warning" size="sm">Global Settings</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Default Fill Threshold (%)</label>
                        <Input defaultValue={config.defaultThresholdPct} type="number" min={50} max={95} className="bg-white/[0.03]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Poll Interval (seconds)</label>
                        <Input defaultValue={config.pollIntervalSec} type="number" min={10} max={3600} className="bg-white/[0.03]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          }

          // Fallback for empty tabs
          return (
            <Card className="bg-white/[0.01] border-white/[0.05]">
              <CardContent className="p-12 text-center">
                <Sliders className="w-8 h-8 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-base font-medium text-white mb-2">{tabs.find(t => t.id === activeTab)?.label} configuration coming soon.</h3>
                <p className="text-sm text-zinc-500">This section is being updated.</p>
              </CardContent>
            </Card>
          );
        }}
      </Tabs>
    </div>
  );
}
