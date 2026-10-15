import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function telemetryApiPlugin(): Plugin {
  const sseClients = new Set<any>();

  function broadcastTelemetry(readings: Array<{ binId: string; distanceCm: number; timestamp?: number }>) {
    const payload = `data: ${JSON.stringify({ type: 'telemetry', readings })}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function normalizeId(raw: string): string {
    const u = raw.toUpperCase().trim();
    if (u === 'BIN-1' || u === 'BIN-001' || u === '1' || u === 'B1') return 'BIN-01';
    if (u === 'BIN-2' || u === 'BIN-002' || u === '2' || u === 'B2') return 'BIN-02';
    if (u === 'BIN-3' || u === 'BIN-003' || u === '3' || u === 'B3') return 'BIN-03';
    if (u === 'BIN-4' || u === 'BIN-004' || u === '4' || u === 'B4') return 'BIN-04';
    return u;
  }

  return {
    name: 'telemetry-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/telemetry', (req, res) => {
        // SSE event stream endpoint: /api/telemetry/events
        if (req.url === '/events' || req.url === '/events/') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          res.write(`data: ${JSON.stringify({ type: 'connected', clients: sseClients.size + 1 })}\n\n`);
          sseClients.add(res);
          req.on('close', () => sseClients.delete(res));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const readings: Array<{ binId: string; distanceCm: number; timestamp: number }> = [];
              const now = Date.now();

              // Check if body is JSON or raw text line
              const trimmed = body.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                  for (const item of parsed) {
                    const binId = normalizeId(item.binId || item.id || '');
                    const dist = Number(item.distanceCm ?? item.distance);
                    if (binId && Number.isFinite(dist)) readings.push({ binId, distanceCm: dist, timestamp: now });
                  }
                } else if (parsed.readings && Array.isArray(parsed.readings)) {
                  for (const item of parsed.readings) {
                    const binId = normalizeId(item.binId || item.id || '');
                    const dist = Number(item.distanceCm ?? item.distance);
                    if (binId && Number.isFinite(dist)) readings.push({ binId, distanceCm: dist, timestamp: now });
                  }
                } else if (parsed.binId || parsed.deviceId || parsed.id) {
                  const rawId = parsed.binId || parsed.id || (parsed.deviceId ? parsed.deviceId.replace('ESP32-SMARTBIN-', 'BIN-') : 'BIN-01');
                  const binId = normalizeId(rawId);
                  const dist = Number(parsed.distanceCm ?? parsed.distance ?? 7);
                  readings.push({ binId, distanceCm: dist, timestamp: now });
                } else {
                  // Key-value JSON e.g. {"B1": 44, "B2": 4, "B3": 0, "B4": 15}
                  for (const [k, v] of Object.entries(parsed)) {
                    const binId = normalizeId(k);
                    const dist = Number(v);
                    if (Number.isFinite(dist)) readings.push({ binId, distanceCm: dist, timestamp: now });
                  }
                }
              } else {
                // Regex match multi-bin raw string: "B1:44 B2:4 B3:0 B4:15"
                const bPattern = /B([1-4])\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/gi;
                let match: RegExpExecArray | null;
                while ((match = bPattern.exec(trimmed)) !== null) {
                  readings.push({
                    binId: `BIN-0${match[1]}`,
                    distanceCm: parseFloat(match[2]),
                    timestamp: now,
                  });
                }
              }

              if (readings.length > 0) {
                broadcastTelemetry(readings);
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                count: readings.length,
                readings,
              }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
            }
          });
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            message: 'SmartBin Telemetry API ready. POST JSON with { binId, distanceCm } or subscribe to SSE on /api/telemetry/events',
            supportedBins: ['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04'],
            calibration: { emptyCm: 11, fullCm: 3 },
            sseClients: sseClients.size,
          }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    telemetryApiPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
