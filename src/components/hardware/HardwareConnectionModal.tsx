import { useState, useEffect, useRef } from 'react';
import { useHardwareSerial } from '@/contexts/HardwareSerialContext';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { getFillColor } from '@/lib/calculations';
import { Cpu, Terminal, RefreshCw, Zap, Trash2, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface HardwareConnectionModalProps {
  open: boolean;
  onClose: () => void;
}

export function HardwareConnectionModal({ open, onClose }: HardwareConnectionModalProps) {
  const {
    isSupported,
    isConnected,
    isConnecting,
    portInfo,
    baudRate,
    rawLogs,
    lastReadings,
    streamStats,
    connectSerial,
    disconnectSerial,
    clearLogs,
    error,
  } = useHardwareSerial();

  const { bins, isHardwareConnected } = useDatabase();
  const [selectedBaud, setSelectedBaud] = useState(baudRate);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [rawLogs, autoScroll]);

  const handleConnect = async () => {
    await connectSerial(selectedBaud);
  };

  const handleDisconnect = async () => {
    await disconnectSerial();
  };

  return (
    <Modal open={open} onClose={onClose} title="ESP32 Hardware Connection (Live IoT)" size="xl">
      <ModalBody className="space-y-6">
        {/* Connection status header bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isConnected || isHardwareConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-zinc-400'
            }`}>
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-white text-sm">
                  {isConnected ? 'ESP32 Connected via USB Serial' : isHardwareConnected ? 'Hardware Active via Local Bridge' : 'ESP32 Disconnected'}
                </h4>
                {isConnected ? (
                  <Badge variant="success" dot pulse>Live USB</Badge>
                ) : isHardwareConnected ? (
                  <Badge variant="success" dot>Live Telemetry</Badge>
                ) : (
                  <Badge variant="default">Offline</Badge>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                {isConnected
                  ? `${portInfo || 'COM Port'} @ ${baudRate} baud • ${streamStats.packetsReceived} packets received`
                  : 'Connect your ESP32 directly via USB to view real ultrasonic sensor readings.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isConnected ? (
              <>
                <select
                  value={selectedBaud}
                  onChange={(e) => setSelectedBaud(Number(e.target.value))}
                  disabled={isConnecting}
                  className="bg-zinc-900 border border-white/10 text-xs font-mono rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none"
                >
                  <option value={115200}>115200 baud</option>
                  <option value={9600}>9600 baud</option>
                  <option value={57600}>57600 baud</option>
                </select>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || !isSupported}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-950/40"
                  size="sm"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 mr-1.5 fill-current" />
                      Connect ESP32 (USB)
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="text-red-400 border-red-500/20 hover:bg-red-500/10"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>

        {/* Quick Connection Tip */}
        {!isConnected && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2.5">
            <span className="text-base">👉</span>
            <div>
              <span className="font-semibold text-white">How to connect:</span> In the Chrome/Edge popup dialog, <strong>click directly on the &ldquo;USB Serial (COM14)&rdquo; row</strong> with your mouse to highlight it. Once selected, the <strong>Connect</strong> button will turn blue and become clickable!
            </div>
          </div>
        )}

        {/* Browser compatibility alert if not Chrome/Edge */}
        {!isSupported && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Web Serial API requires a Chromium browser.</p>
              <p className="text-amber-400/80 mt-0.5">
                Please open this application in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Opera</strong> to connect directly to your COM port. Alternatively, run the background serial relay: <code className="bg-black/30 px-1 py-0.5 rounded font-mono">npm run bridge</code> in your terminal.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* 4 Physical Bins Live Telemetry Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Live Sensor Channels ({bins.filter(b => b.meta.source === 'device').length} / 4 Active)
            </h5>
            <span className="text-[11px] text-zinc-500 font-mono">
              Calibration: 11 cm = Empty • 3 cm = Full
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04'].map((id, index) => {
              const bin = bins.find(b => b.id === id);
              const reading = lastReadings[id];
              const distanceCm = bin?.live.distanceCm ?? reading?.distanceCm ?? 11;
              const fillPct = bin?.live.fillPct ?? reading?.fillPct ?? 0;
              const status = bin?.live.binStatus ?? reading?.binStatus ?? 'Empty';
              const isDeviceSource = bin?.meta.source === 'device' || isConnected;

              return (
                <div
                  key={id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isDeviceSource
                      ? 'bg-white/[0.03] border-white/10 shadow-lg shadow-black/20'
                      : 'bg-white/[0.01] border-white/[0.04] opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-medium text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getFillColor(fillPct) }} />
                      Bin {index + 1}
                    </span>
                    <StatusBadge status={status} />
                  </div>

                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <div className="text-2xl font-mono font-bold" style={{ color: getFillColor(fillPct) }}>
                        {fillPct}%
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400">
                        {distanceCm.toFixed(1)} cm
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-mono text-zinc-500">
                      <div>Trigger: 80%</div>
                      <div>{isDeviceSource ? 'LIVE' : 'IDLE'}</div>
                    </div>
                  </div>

                  <ProgressBar value={fillPct} size="sm" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Serial Stream Monitor Console */}
        <div className="rounded-xl border border-white/[0.08] bg-black/60 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-medium text-zinc-300">
                Incoming Serial Stream Monitor (115200 Baud)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                />
                Auto-scroll
              </label>
              <Button variant="ghost" size="sm" onClick={clearLogs} className="h-6 px-2 text-[10px] text-zinc-400 hover:text-white">
                <Trash2 className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>
          </div>

          <div className="h-44 overflow-y-auto p-3 font-mono text-xs text-zinc-300 space-y-1">
            {rawLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
                No serial data yet. Click &ldquo;Connect ESP32 (USB)&rdquo; above to start streaming from your COM port.
              </div>
            ) : (
              rawLogs.map((log, i) => (
                <div key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-zinc-600 select-none text-[10px] shrink-0">{i + 1}</span>
                  <span className={log.includes('B1:') || log.includes('distance=') ? 'text-emerald-400' : 'text-zinc-400'}>
                    {log}
                  </span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center">
        <div className="text-xs font-mono text-zinc-500">
          CH340 / CP210x ESP32 Node
        </div>
        <Button variant="secondary" onClick={onClose} size="sm">
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
