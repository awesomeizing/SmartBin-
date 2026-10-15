import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { parseSerialLine, type ParsedReading } from '@/services/hardware/serialParser';
import { useDatabase } from '@/contexts/DatabaseContext';

export interface StreamStats {
  packetsReceived: number;
  lastPacketTime: number | null;
  bytesReceived: number;
}

interface HardwareSerialContextType {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  portInfo: string | null;
  baudRate: number;
  lastReadings: Record<string, ParsedReading>;
  lastRawLine: string;
  rawLogs: string[];
  streamStats: StreamStats;
  connectSerial: (customBaud?: number) => Promise<boolean>;
  disconnectSerial: () => Promise<void>;
  clearLogs: () => void;
  error: string | null;
}

const HardwareSerialContext = createContext<HardwareSerialContextType | null>(null);

export function HardwareSerialProvider({ children }: { children: React.ReactNode }) {
  const { ingestHardwareReadings, setHardwareConnected } = useDatabase();

  const [isSupported, setIsSupported] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [baudRate, setBaudRate] = useState(115200);
  const [lastRawLine, setLastRawLine] = useState('');
  const [rawLogs, setRawLogs] = useState<string[]>([]);
  const [lastReadings, setLastReadings] = useState<Record<string, ParsedReading>>({});
  const [error, setError] = useState<string | null>(null);
  const [streamStats, setStreamStats] = useState<StreamStats>({
    packetsReceived: 0,
    lastPacketTime: null,
    bytesReceived: 0,
  });

  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const keepReadingRef = useRef(false);

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'serial' in navigator);
  }, []);

  const addLog = useCallback((line: string) => {
    setRawLogs(prev => {
      const next = [...prev, line];
      if (next.length > 100) return next.slice(next.length - 100);
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => setRawLogs([]), []);

  const disconnectSerial = useCallback(async () => {
    keepReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {});
        try {
          readerRef.current.releaseLock();
        } catch {
          // ignore
        }
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close().catch(() => {});
        portRef.current = null;
      }
    } catch (err) {
      console.warn('Error during serial port close:', err);
    } finally {
      setIsConnected(false);
      setIsConnecting(false);
      setPortInfo(null);
      setHardwareConnected(false);
      addLog('[SERIAL] Disconnected from ESP32.');
    }
  }, [addLog, setHardwareConnected]);

  const connectSerial = useCallback(async (customBaud = 115200): Promise<boolean> => {
    if (!('serial' in navigator)) {
      setError('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.');
      return false;
    }

    try {
      setError(null);
      setIsConnecting(true);

      // Request port from user
      const navSerial = (navigator as any).serial;
      const port = await navSerial.requestPort();
      portRef.current = port;

      // Extract device info if available
      const info = port.getInfo();
      const usbVendor = info.usbVendorId ? `VID: 0x${info.usbVendorId.toString(16)}` : '';
      const usbProduct = info.usbProductId ? `PID: 0x${info.usbProductId.toString(16)}` : '';
      const deviceTitle = [usbVendor, usbProduct].filter(Boolean).join(' ') || 'USB Serial Device';
      setPortInfo(deviceTitle);
      setBaudRate(customBaud);

      // Open at requested baud rate
      await port.open({ baudRate: customBaud });

      setIsConnected(true);
      setIsConnecting(false);
      setHardwareConnected(true);
      keepReadingRef.current = true;
      addLog(`[SERIAL] Connected at ${customBaud} baud (${deviceTitle})`);

      // Watch for hardware disconnection
      port.addEventListener?.('disconnect', () => {
        disconnectSerial();
      });

      // Start direct read loop with native TextDecoder to avoid stream locking issues
      const reader = port.readable.getReader();
      readerRef.current = reader;
      const textDecoder = new TextDecoder();

      // Process incoming stream in background
      (async () => {
        let buffer = '';
        try {
          while (keepReadingRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              const text = textDecoder.decode(value, { stream: true });
              setStreamStats(s => ({
                packetsReceived: s.packetsReceived + 1,
                lastPacketTime: Date.now(),
                bytesReceived: s.bytesReceived + value.length,
              }));

              buffer += text;
              if (buffer.length > 4000) {
                buffer = buffer.slice(-1000);
              }
              const lines = buffer.split(/[\r\n]+/);
              // The last item might be incomplete, keep it in the buffer
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                setLastRawLine(trimmed);
                addLog(trimmed);

                const readings = parseSerialLine(trimmed);
                if (readings.length > 0) {
                  setLastReadings(prev => {
                    const next = { ...prev };
                    for (const r of readings) {
                      next[r.binId] = r;
                    }
                    return next;
                  });

                  // Feed immediately into central DatabaseContext
                  ingestHardwareReadings(readings);

                  // Relay to local telemetry endpoint
                  fetch('/api/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ readings, raw: trimmed }),
                  }).catch(() => {});
                }
              }
            }
          }
        } catch (err: any) {
          if (keepReadingRef.current) {
            console.error('[SERIAL] Read loop error:', err);
            setError(err?.message || 'Serial read error occurred.');
            disconnectSerial();
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
        }
      })();

      return true;
    } catch (err: any) {
      setIsConnecting(false);
      setIsConnected(false);
      setHardwareConnected(false);
      if (err.name !== 'NotFoundError') {
        setError(err.message || 'Failed to open serial port.');
      }
      return false;
    }
  }, [addLog, disconnectSerial, ingestHardwareReadings, setHardwareConnected]);

  return (
    <HardwareSerialContext.Provider
      value={{
        isSupported,
        isConnected,
        isConnecting,
        portInfo,
        baudRate,
        lastReadings,
        lastRawLine,
        rawLogs,
        streamStats,
        connectSerial,
        disconnectSerial,
        clearLogs,
        error,
      }}
    >
      {children}
    </HardwareSerialContext.Provider>
  );
}

export function useHardwareSerial() {
  const ctx = useContext(HardwareSerialContext);
  if (!ctx) {
    throw new Error('useHardwareSerial must be used within a HardwareSerialProvider');
  }
  return ctx;
}
