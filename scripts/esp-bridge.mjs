#!/usr/bin/env node

/**
 * SmartBin+ — ESP32 Local Serial Bridge
 * =============================================================================
 * Connects to the ESP32 on USB (auto-detects COM port, e.g. COM13 / COM14 at 115200 baud),
 * reads real-time ultrasonic sensor telemetry (B1:xx B2:xx B3:xx B4:xx), and forwards it
 * to the local SmartBin development server (http://localhost:5173/api/telemetry).
 *
 * Usage:
 *   npm run bridge
 *   node scripts/esp-bridge.mjs [COM_PORT] [BAUD_RATE]
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import http from 'node:http';

const SPECIFIED_PORT = process.argv[2] || process.env.ESP_PORT || 'AUTO';
const DEFAULT_BAUD = Number(process.argv[3] || process.env.ESP_BAUD || 115200);
const TARGET_URL = process.env.TELEMETRY_URL || 'http://localhost:5173/api/telemetry';

console.log('====================================================');
console.log('       SmartBin+ — ESP32 Real-Time Serial Bridge     ');
console.log('====================================================');
console.log(`Port mode:   ${SPECIFIED_PORT}`);
console.log(`Baud Rate:   ${DEFAULT_BAUD}`);
console.log(`Target URL:  ${TARGET_URL}`);
console.log('----------------------------------------------------');
console.log('Starting serial listener with auto-reconnect...\n');

function postTelemetry(rawLine) {
  try {
    const url = new URL(TARGET_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 5173,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(rawLine),
        },
        timeout: 2000,
      },
      (res) => {
        res.on('data', () => {});
      }
    );

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        process.stdout.write(`[WAIT] Dev server at ${TARGET_URL} not reachable yet. (Start with 'npm run dev')\r`);
      }
    });

    req.write(rawLine);
    req.end();
  } catch (err) {
    // Ignore URL errors
  }
}

// PowerShell script with continuous auto-detection and reconnect loop
const psScript = `
$targetPort = '${SPECIFIED_PORT}'
$baud = ${DEFAULT_BAUD}

while ($true) {
  $actualPort = $targetPort
  if ($actualPort -eq 'AUTO' -or !$actualPort) {
    # 1. First look for real USB-UART adapters (CH340, CP210, FTDI, etc.) that are actually connected
    $usbPorts = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
      ($_.FriendlyName -match 'CH340|CP210|FTDI|USB-SERIAL|USB Serial|Silicon Labs|Prolific' -or ($_.Class -eq 'Ports' -and $_.FriendlyName -notmatch 'Bluetooth')) -and $_.FriendlyName -match '\((COM\d+)\)'
    } | ForEach-Object {
      if ($_.FriendlyName -match '\((COM\d+)\)') { $matches[1] }
    }
    if ($usbPorts -and $usbPorts.Count -gt 0) {
      $actualPort = $usbPorts[0]
    } else {
      # 2. Fallback to System.IO.Ports excluding common virtual Bluetooth ports
      $allPorts = [System.IO.Ports.SerialPort]::GetPortNames()
      if ($allPorts -and $allPorts.Count -gt 0) {
        $actualPort = $allPorts[0]
      }
    }
  }

  if (!$actualPort -or $actualPort -eq 'AUTO') {
    Write-Output "[WAIT] Scanning for connected ESP32 COM port..."
    Start-Sleep -Seconds 2
    continue
  }

  try {
    $p = New-Object System.IO.Ports.SerialPort $actualPort, $baud, 'None', 8, 'One'
    $p.ReadTimeout = 1500
    $p.Open()
    Write-Output "[READY] Connected to $actualPort at $baud baud"

    while ($p.IsOpen) {
      try {
        $line = $p.ReadLine()
        if ($line) {
          Write-Output $line.Trim()
        }
      } catch [System.TimeoutException] {
        # Idle timeout is normal
      } catch {
        break
      }
    }
  } catch {
    Write-Output "[ERROR] Failed to open \${actualPort}: " + $_.Exception.Message
    Start-Sleep -Seconds 2
  } finally {
    if ($p -and $p.IsOpen) { 
      try { $p.Close() } catch {}
    }
  }
}
`;

const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]);

let buffer = '';

ps.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split(/[\r\n]+/);
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('[READY]')) {
      console.log(`\x1b[32m✔ ${trimmed}\x1b[0m`);
    } else if (trimmed.startsWith('[ERROR]')) {
      console.log(`\x1b[31m✖ ${trimmed}\x1b[0m`);
    } else if (trimmed.startsWith('[WAIT]')) {
      console.log(`\x1b[33m⏳ ${trimmed}\x1b[0m`);
    } else {
      console.log(`\x1b[36m[STREAM]\x1b[0m ${trimmed}`);
      postTelemetry(trimmed);
    }
  }
});

ps.stderr.on('data', (err) => {
  console.error('\x1b[31m[PS ERR]\x1b[0m', err.toString());
});

ps.on('close', (code) => {
  console.log(`\nBridge process exited with code ${code}`);
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  console.log('\nShutting down serial bridge...');
  ps.kill();
  process.exit(0);
});
