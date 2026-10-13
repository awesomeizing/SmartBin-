import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function telemetryApiPlugin(): Plugin {
  return {
    name: 'telemetry-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/telemetry', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const rawId = (data.binId || data.id || 'BIN-01').toString().toUpperCase().trim();
              const binId = rawId === 'BIN-1' || rawId === 'BIN-001' || rawId === '1' ? 'BIN-01'
                : rawId === 'BIN-2' || rawId === 'BIN-002' || rawId === '2' ? 'BIN-02'
                : rawId === 'BIN-3' || rawId === 'BIN-003' || rawId === '3' ? 'BIN-03'
                : rawId === 'BIN-4' || rawId === 'BIN-004' || rawId === '4' ? 'BIN-04'
                : rawId;

              const distanceCm = typeof data.distanceCm === 'number'
                ? Math.max(3, Math.min(11, data.distanceCm))
                : 7.0;

              // Shared formula: fillPercentage = ((11 - distance) / 8) * 100
              const rawPct = ((11 - distanceCm) / 8) * 100;
              const fillPercentage = Math.round(Math.max(0, Math.min(100, rawPct)) * 10) / 10;
              const status = fillPercentage >= 80 ? 'FULL' : fillPercentage >= 50 ? 'FILLING' : 'OK';

              const response = {
                success: true,
                bin: {
                  id: binId,
                  distanceCm,
                  fillPercentage,
                  status,
                  sensorOnline: true,
                  timestamp: Date.now(),
                },
              };

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(response));
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
            message: 'SmartBin Telemetry API ready. POST JSON with { binId, distanceCm }',
            supportedBins: ['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04'],
            calibration: { emptyCm: 11, fullCm: 3 },
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
