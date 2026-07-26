# SmartBin+ — Phase 1: Architecture & Roadmap

**Status:** Awaiting approval. No application code written yet.
**Source of truth:** Major Project Phase-I Report, CSEP23605, Group 54, GAT Bengaluru.
**Inputs reviewed:** project report (full), literature survey paper (full), existing website (1,630 lines, full).

---

## PART A — Conflicts in the source documents

These must be resolved before code is written. Six of them are real problems in the report itself, and one is serious.

### A1. Chapter 2.1.1 is about the wrong project — CRITICAL

Report §2.1.1 "Overview of Existing Work" reads:

> "The literature related to this project can be broadly grouped into four themes: **reward hacking and alignment, explainable reinforcement learning, safe reinforcement learning and formal verification** and empirical methods for detecting anomalous or exploitative behavior..."

This is text from a machine-learning alignment project. It has nothing to do with waste management. It sits directly above your literature survey table, which is correct and on-topic. Your survey paper has the right text for this section.

This is in your submitted Phase-I report. Fix it in the document regardless of what happens with the website. I will not reproduce it anywhere in the site.

### A2. Firebase vs Blynk

| Location | Says |
|---|---|
| Report abstract, Objective 3, §2.2, §3.1, §3.4, §4 | **Firebase Realtime Database** |
| Report §5 Step 4 | "The **Blynk IoT v2.0** dashboard was provisioned with gauge widgets..." |
| Existing website §Specs | "**Blynk IoT (v2.0)** — Remote monitoring dashboard platform" |

**Resolution: Firebase.** It wins on count, it's in the objectives and the formal requirements, and it's what your hardware actually uses. The Blynk references are leftovers. Report §5 Step 4 should be corrected to say the web dashboard was provisioned against Firebase.

### A3. The architecture chapter describes hardware you don't have

Report §4.2 and all three DFDs describe:

- **Gas sensors** (odor detection) — not in §3.3 Hardware Requirements
- **A servo motor lid actuator** driven by PWM — not in §3.3
- **"Open/Close Lid Command"** from the user, **"Lid Control Signal"** to actuators — the entire DFD Level 0 user-interaction path
- **GSM module** as an alternative to Wi-Fi — not in §3.3
- **MQTT broker / IoT Core** — you use Firebase REST/HTTPS, not MQTT
- **Cloud API Gateway** — Firebase SDK talks directly, there's no gateway

Meanwhile your actual hardware includes a **red LED, buzzer, and OLED display** that appear in *neither* §3.3 nor the architecture chapter.

**Resolution:** The interactive architecture diagram I build will show **what you actually built** — ESP32, HC-SR04, LED, buzzer, OLED, Wi-Fi, Firebase, dashboard, alerts, truck, citizen. Gas sensor and servo lid move to the Future Scope section, clearly labelled as planned. Building an animated diagram of a servo you don't own is exactly the kind of thing a panel catches.

### A4. The 98.5% figure is not yours

The abstract claims "a **GSM** message success rate of 98.5%". You have no GSM module. Report §3.2 gives it away: *"consistent with the experimentally demonstrated 98.5% GSM/cloud message success rate **reported in the literature**."*

**Resolution:** On the site, 98.5% is either dropped or cited as a literature benchmark, never as a SmartBin+ measurement. Your own measured results — 95% detection accuracy, 6.8 s mean latency, 4.95 V power stability — are real and will be presented as project results.

### A5. The fill-level formula is garbled

Report §3.1 prints: `Fill Level (%) = 1 dmeasured × 100`

The intended formula, given `d_max` = distance to bin bottom when empty:

```
fillPercent = (1 − d_measured / d_max) × 100
```

With the report's 20 cm prototype bin: `d_max = 20`. A reading of 5 cm → 75% full. This is what firmware and dashboard will both use, clamped to [0, 100].

### A6. Threshold and colour bands disagree

| Source | Bands |
|---|---|
| **Report §3.1** | Green 0–50 (Empty/Low), Amber 51–79 (Half/Moderate), Red 80–100 (Full/Critical) |
| Report Objective 4 | threshold "80–90%" |
| Existing website | Green <40, Yellow 40–79, Red ≥80 |
| Survey paper §VI | "typically somewhere around 70 to 80 percent" |

**Resolution: report §3.1 wins.** 0–50 / 51–79 / 80–100, alert fires at **80%**, and the threshold is admin-configurable (80–90 range) so Objective 4 is satisfied and the survey's dynamic-threshold recommendation has somewhere to land.

### A7. Team USNs are swapped on the current website

| Name | Report (correct) | Website (wrong) |
|---|---|---|
| Siddarth K L | 1GA23CS161 | 1GA23CS161 ✓ |
| **Sukesh** | **1GA23CS171** | 1GA23CS175 ✗ |
| **Sushanth P Raj** | **1GA23CS175** | 1GA23CS171 ✗ |
| Vishaal Roopa Ramu | 1GA24CS416 | 1GA24CS416 ✓ |

Also: report says "Sushanth P **Raj**" and "Vish**aa**l", website drops both. Guide is "Dr. Kumara**s**wamy S" in the report, "Kumarswamy" on the site. Report spellings will be used throughout.

Emails from the survey paper are available for the team page: Siddarthkrishna50@gmail.com, sukesh1ga23cs171@gmail.com, susharthpraj@gmail.com, vishaal62004@gmail.com, skswamy@gat.ac.in.

---

## PART B — The honesty problem, and how the architecture solves it

You said: *"Nothing should rely on fake values unless Simulation Mode is enabled."* Agreed, and this is the single most important design decision in the project.

**You have one physical bin.** A Smart City Command Center showing 24 live bins would be 23 lies. Any examiner who asks "where is bin 7?" ends the demo.

**The resolution — a hard data-provenance rule.** Every bin in the system carries a `source` field with one of three values, and it is **visible in the UI at all times**:

| `source` | Meaning | UI treatment |
|---|---|---|
| `device` | Real ESP32 pushing to Firebase | Solid border, "LIVE" chip, green telemetry dot |
| `simulated` | Generated by Simulation Engine | Dashed border, amber "SIM" chip, diagonal hatch on cards |
| `offline` | Registered but no data in > 3 × poll interval | Grey, "STALE" chip, last-seen timestamp |

`BIN-001` is your real bin. Everything else is `simulated` and says so. A **global provenance banner** sits in the dashboard header: *"1 live device · 11 simulated nodes · Simulation Mode ON"*.

This is strictly better for your viva than fake realism. It demonstrates you understand the difference between a validated prototype and a deployment, which is exactly what report §2.3 claims ("The current prototype validates the full pipeline on a controlled testbed"). It also directly answers the literature survey's repeated criticism that prior work is *"simulation only"* (Table I, ref [20]) — you'll be the project that labels its simulation instead of hiding it.

**GPS follows the same rule.** Report §1.3 and §2.3 both place GPS in Phase-II future scope. The ESP32 has no GPS module. So bin coordinates are **admin-assigned registration metadata**, stored in Firebase under `/bins/{id}/location`, marked `"source": "manual"`. The Leaflet map is fully real — real tiles, real coordinates, real geography around GAT / RR Nagar Bengaluru — the coordinates are just configured rather than device-reported. That is honest and it is also how most real municipal deployments actually work, since bins don't move.

---

## PART C — Requirements traceability

Every report requirement mapped to where it gets built. Nothing invented.

### Functional (report §3.1)

| Req | Implementation | Module |
|---|---|---|
| Ultrasonic distance input | Firmware reads HC-SR04, TRIG=GPIO5, ECHO=GPIO18 | M12 |
| Fill % via calibrated formula | `(1 − d/d_max) × 100`, clamped | M12 + `utils/fill.js` |
| Validation & outlier rejection | Bounds check 0–`d_max`; 5-sample rolling median (report §5.2) | M12 |
| Normalized schema | Timestamp, Bin ID, Distance_cm, Fill_Level, Bin_Status, Message_Status | M03 |
| Transmit at 60 s default | Configurable poll interval, HTTPS | M12 + M11 settings |
| Threshold alert ≥ 80% | Alert Engine, configurable 80–90 | M08 |
| Real-time dashboard | Firebase `onValue` listeners | M04 |
| Historical trends | `/history/{binId}` time-series | M09 |
| Bins requiring collection | Priority queue, feeds route optimizer | M07 |
| 3-state colour coding | Green 0–50 / Amber 51–79 / Red 80–100 | Design tokens |

### Non-functional (report §3.2)

| Req | Target | How it's demonstrated |
|---|---|---|
| Performance | Sensor→cloud ≤ 10 s; dashboard refresh ≤ 3 s | Live latency meter in System Health panel, measured not claimed |
| Reliability | ≥ 95% delivery; retry with exponential back-off | Firmware back-off 1 s → 30 s; delivery-rate counter |
| Usability | Non-technical municipal staff | Colour + text + icon on every state, no colour-only encoding |
| Security | Firebase Auth; HTTPS/TLS | M02 + published security rules |
| Scalability | Add bins with zero code change | Bin registry is data; UI renders whatever exists |
| Maintainability | Modular, commented, Git | ES modules, JSDoc on public functions |
| Availability | 99% uptime | Connection state machine + offline queue |

### Objectives (report §1.2) → landing page sections

O1 sensing → Architecture + 3D bin · O2 processing → Architecture · O3 Firebase transmit → Architecture + live sync · O4 alerts → Alert Center · O5 centralized dashboard → Dashboard · O6 fewer trips → Route Optimizer · O7 fuel/time/manpower → Impact metrics

---

## PART D — Technical decisions

### D1. No build step — this is forced, and it's fine

Your Linux sandbox won't boot (disk space), so I cannot run `npm install`, a bundler, or a dev server. Therefore:

**Vanilla ES modules + CDN dependencies. No Node, no npm, no Vite, no build.**

Consequences, honestly stated:

- ✅ Opens and runs anywhere, zero setup — good for a demo on a lab machine
- ✅ No `node_modules`, no lockfile drift, nothing to break before your viva
- ✅ You can read every line; nothing is compiled away
- ⚠️ Must be served over HTTP, not `file://` — ES modules and Firebase Auth both require a real origin. **Use VS Code Live Server, or `python -m http.server 8000` in the project root.** This will be in the README.
- ⚠️ Code splitting is done via native dynamic `import()` rather than a bundler. Still real code splitting, just browser-native.

If you free up disk space later, this migrates to Vite in about an hour. Nothing in the architecture blocks it.

### D2. Dependencies (all CDN, pinned)

| Library | Version | Purpose |
|---|---|---|
| Firebase JS SDK (modular) | 10.x | Auth, Realtime Database |
| Leaflet | 1.9.x | Smart City map |
| Chart.js | 4.x | Analytics |
| Three.js | r128 | 3D SmartBin section |

Everything else — particles, animated architecture, sensor waves, truck animation, city scene — is **hand-written Canvas/SVG/CSS**. No animation library. Keeps it fast and keeps the code yours.

### D3. Firebase data model

```
smartbinplus-rtdb/
├── bins/
│   └── BIN-001/
│       ├── meta/                    # written once at registration (admin)
│       │   ├── binId: "BIN-001"
│       │   ├── label: "GAT Main Gate"
│       │   ├── zone: "Zone-A"
│       │   ├── address: "Rajarajeshwari Nagar, Bengaluru 560098"
│       │   ├── location: { lat, lng, source: "manual" }
│       │   ├── depthCm: 20           # d_max, report §3.3
│       │   ├── thresholdPct: 80      # report §3.1, overridable per bin
│       │   ├── source: "device"      # device | simulated
│       │   └── installedAt: <ts>
│       ├── live/                     # ESP32 writes here every 60 s
│       │   ├── distanceCm: 5.0
│       │   ├── fillPct: 75.0
│       │   ├── binStatus: "Half"     # Empty | Half | Full  (report §3.1)
│       │   ├── messageStatus: "Delivered"
│       │   ├── rssi: -42
│       │   ├── batteryPct: 87
│       │   ├── uptimeSec: 40213
│       │   ├── firmware: "1.0.0"
│       │   └── timestamp: <server ts>
│       ├── health/
│       │   ├── sensorOk, wifiOk, ledOk, buzzerOk, oledOk
│       │   ├── healthScore: 0-100
│       │   └── lastMaintenance
│       └── reserved/                 # schema placeholders, Phase-II
│           ├── temperatureC: null
│           ├── humidityPct: null
│           └── gasPpm: null
│
├── history/{binId}/{pushId}          # append-only, capped client-side
│     └── { fillPct, distanceCm, binStatus, timestamp }
│
├── alerts/{alertId}
│     └── { binId, severity, type, message, raisedAt,
│             acknowledgedBy, acknowledgedAt, resolvedAt, state }
│
├── events/{eventId}                  # Timeline — report DFD D2 "Logs & History"
│     └── { binId, kind, detail, actor, timestamp }
│       kinds: SENSOR_UPDATE | THRESHOLD_REACHED | NOTIFICATION_SENT
│              | TRUCK_DISPATCHED | TRUCK_ARRIVED | COLLECTION_COMPLETED
│              | DB_UPDATED | DEVICE_ONLINE | DEVICE_OFFLINE | SENSOR_FAULT
│
├── trucks/{truckId}
│     └── { label, status, position:{lat,lng}, assignedRoute[], capacityL, driver }
│
├── routes/{routeId}
│     └── { stops[], optimizedKm, traditionalKm, savedKm,
│             fuelSavedL, co2SavedKg, createdAt, completedAt }
│
├── config/
│     ├── defaultThresholdPct: 80
│     ├── pollIntervalSec: 60
│     ├── truckKmPerL: 3.5            # documented assumption
│     ├── co2KgPerL: 2.68             # documented assumption
│     └── simulationMode: false
│
└── users/{uid}
      └── { email, displayName, role, zone, createdAt }
        roles: administrator | municipality | user
```

**Design notes.** `meta` and `live` are split so the dashboard subscribes only to `live` — small, high-frequency payloads. History is append-only for the analytics charts. `reserved` holds the temperature/humidity fields you flagged as future so the schema doesn't need migrating in Phase-II.

**Every derived metric declares its formula in a tooltip.** Fuel saved = `savedKm / truckKmPerL`. CO₂ = `fuelSavedL × 2.68`. Both constants live in `/config` and are shown in the UI. No unexplained numbers on a dashboard you have to defend.

### D4. Security rules

```javascript
{
  "rules": {
    "bins": {
      ".read": "auth != null",
      "$binId": {
        "live":   { ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() == 'administrator' || auth.token.device === true)" },
        "meta":   { ".write": "root.child('users').child(auth.uid).child('role').val() == 'administrator'" },
        "health": { ".write": "auth != null" }
      }
    },
    "history": { ".read": "auth != null", "$binId": { ".write": "auth != null" } },
    "alerts":  { ".read": "auth != null",
                 ".write": "root.child('users').child(auth.uid).child('role').val() != 'user'" },
    "events":  { ".read": "auth != null", ".write": "auth != null" },
    "config":  { ".read": "auth != null",
                 ".write": "root.child('users').child(auth.uid).child('role').val() == 'administrator'" },
    "users":   { "$uid": { ".read": "auth.uid == $uid || root.child('users').child(auth.uid).child('role').val() == 'administrator'",
                           ".write": "root.child('users').child(auth.uid).child('role').val() == 'administrator'" } }
  }
}
```

Satisfies report §3.2 Security. Rules ship as a file in the repo, which is itself evidence for the viva.

### D5. Role matrix (report §3.2, your spec)

| Capability | User | Municipality | Administrator |
|---|:--:|:--:|:--:|
| View dashboard / map | ✓ | ✓ | ✓ |
| Bin detail & history | ✓ | ✓ | ✓ |
| Acknowledge alerts | — | ✓ | ✓ |
| Dispatch truck | — | ✓ | ✓ |
| Export CSV / PDF | — | ✓ | ✓ |
| Simulation controls | — | — | ✓ |
| Thresholds & config | — | — | ✓ |
| Register/remove bins | — | — | ✓ |
| User management | — | — | ✓ |

### D6. Connection state machine

Report §3.2 requires resilience; the survey paper names network dependency as a top-three limitation (§V). Explicit states, surfaced in the UI:

`ONLINE → DEGRADED → OFFLINE → RECONNECTING → ONLINE`

- Firebase `.info/connected` drives transitions
- Writes while offline queue in memory, flush on reconnect
- Stale detection: no `live.timestamp` update in 3 × `pollIntervalSec` → bin marked `offline`
- The header status pill shows the true state, always. It is never hardcoded green.

---

## PART E — Folder structure

```
smartbin-plus/
├── index.html                      # landing
├── dashboard.html                  # app shell (auth-gated)
├── login.html
├── README.md
├── firebase-rules.json
├── ARCHITECTURE.md
│
├── assets/
│   ├── images/ · icons/ · sounds/  # alert.mp3, critical.mp3, notify.mp3
│   └── fonts/
│
├── config/
│   ├── firebase.config.js          # project keys
│   ├── app.config.js               # thresholds, intervals, constants
│   └── constants.js                # enums: BinStatus, AlertSeverity, Role, Source
│
├── firebase/
│   ├── init.js                     # SDK bootstrap
│   ├── auth.service.js             # sign in/out, role resolution, guards
│   ├── db.service.js               # typed read/write wrappers
│   ├── listeners.js                # onValue subscription manager + teardown
│   ├── connection.js               # state machine, offline queue
│   └── seed.js                     # one-time bin registration (admin)
│
├── js/
│   ├── core/
│   │   ├── store.js                # observable app state, single source
│   │   ├── router.js               # hash router for dashboard views
│   │   ├── events.js               # pub/sub bus
│   │   └── lazy.js                 # dynamic import() helper
│   ├── utils/
│   │   ├── fill.js                 # the formula, one place only
│   │   ├── geo.js                  # haversine, bearing
│   │   ├── format.js               # dates, units, %
│   │   ├── export.js               # CSV + PDF
│   │   ├── a11y.js                 # focus trap, live regions
│   │   └── dom.js
│   ├── simulation/
│   │   ├── engine.js               # tick loop, writes to Firebase
│   │   └── scenarios.js            # the 11 scenarios
│   └── main.js
│
├── components/                     # each = .js + .css, self-contained
│   ├── nav/ · sidebar/ · kpi-card/ · bin-card/ · bin-modal/
│   ├── alert-item/ · toast/ · timeline/ · status-pill/
│   ├── provenance-badge/ · modal/ · table/ · skeleton/
│
├── pages/
│   ├── landing/                    # hero, particles, city, stats, objectives,
│   │                               # tech stack, architecture, timeline,
│   │                               # research, CTA, footer
│   ├── dashboard/ · map/ · analytics/ · alerts/
│   ├── trucks/ · timeline/ · simulation/ · settings/
│   ├── team/ · about/ · future-scope/
│
├── animations/
│   ├── particles.js · city3d.js · truck.js
│   ├── sensor-wave.js · cloud-sync.js · scroll-reveal.js
│
├── charts/
│   ├── chart.theme.js              # shared Chart.js dark theme
│   ├── daily.js · weekly.js · monthly.js
│   ├── prediction.js · heatmap.js · kpi.js
│
├── maps/
│   ├── map.init.js · markers.js · route-layer.js · map.theme.js
│
├── models/                         # Three.js
│   ├── bin3d.js · scene.js · interactions.js
│
├── css/
│   ├── tokens.css                  # colours, spacing, type, motion
│   ├── base.css · layout.css · glass.css
│   ├── animations.css · utilities.css · responsive.css
│
└── firmware/
    └── smartbin_esp32/
        ├── smartbin_esp32.ino
        ├── config.h                # WiFi + Firebase creds (gitignored)
        ├── sensor.h                # HC-SR04 + median filter
        ├── display.h               # OLED
        ├── indicators.h            # LED + buzzer
        └── cloud.h                 # Firebase + back-off
```

---

## PART F — Design system

Your palette, applied with intent rather than decoration.

```css
--sb-green-500:  #22C55E;   /* primary · healthy · 0–50%   */
--sb-blue-500:   #3B82F6;   /* secondary · info · trucks   */
--sb-amber-500:  #F59E0B;   /* warning · 51–79%            */
--sb-red-500:    #EF4444;   /* critical · 80–100%          */
--sb-slate-950:  #020617;   /* app background              */
--sb-slate-900:  #0F172A;   /* surface                     */
--sb-slate-800:  #1E293B;   /* raised surface              */
```

**Kept from your existing site:** Syne / DM Sans / DM Mono type pairing (genuinely good), `// section-tag` headers, toast system, scroll-reveal, alert left-border severity coding.

**Cut:** the custom cursor (`cursor: none` breaks accessibility and touch), and per-frame `Math.random()` in telemetry displays.

**Glassmorphism, used sparingly.** `backdrop-filter: blur(16px)` on nav, modals, and floating panels only. Not on data cards — blur behind numbers hurts legibility, and this is a monitoring console.

**Motion.** 150 ms micro-interactions, 300 ms transitions, 600 ms reveals. Material standard easing `cubic-bezier(0.4, 0, 0.2, 1)`. Everything wrapped in `@media (prefers-reduced-motion: reduce)`.

**Accessibility.** Full keyboard nav with visible focus rings, ARIA live regions for incoming alerts, `role="status"` on the connection pill, focus trap in modals, every status conveyed by icon + text + colour (never colour alone — this matters for a municipal tool), 4.5:1 minimum contrast.

---

## PART G — Simulation Engine

Eleven scenarios, per your spec. Each writes to Firebase like a real device would, so **every downstream module reacts through the normal data path** — no special-casing, no parallel code path. That's what makes it a real simulator rather than a UI puppet.

| # | Scenario | Effect |
|---|---|---|
| 1 | Increase waste | `fillPct` ramps; crosses 51 and 80 thresholds naturally |
| 2 | Decrease waste | Manual reduction (compaction/settling) |
| 3 | Sensor failure | `distanceCm` → out-of-range; `health.sensorOk = false`; SENSOR_FAULT event |
| 4 | ESP32 restart | `uptimeSec` → 0, brief offline, DEVICE_ONLINE event |
| 5 | Network failure | Writes stop; bin goes stale → `offline` after 3 intervals |
| 6 | Firebase disconnect | Forces connection state machine to OFFLINE; offline queue engages |
| 7 | Battery drain | `batteryPct` decays; warning at 20%, critical at 10% |
| 8 | Truck collection | Truck animates to bin, `fillPct` → 0, COLLECTION_COMPLETED, alert resolves |
| 9 | Emergency overflow | Jump to 100%; critical alert + sound |
| 10 | Rain | Humidity placeholder populates; sensor variance widens |
| 11 | Fire | Temperature placeholder spikes; highest-severity alert |

Scenarios 10 and 11 write to `reserved/` and are **labelled "Phase-II sensor — simulated"** in the UI, since you have no DHT22 or gas sensor. Same honesty rule as everything else.

Administrator-only. Global kill switch. When ON, the provenance banner turns amber across every page.

---

## PART H — Route optimization

Report §2.3 defers routing to Phase-II, but "Route Optimization" is in your project title and the survey paper (§VI) explicitly recommends Dijkstra/A*. So it gets built, correctly and modestly:

1. **Candidate set:** bins where `fillPct ≥ threshold`
2. **Cost matrix:** haversine distance between all candidates + depot
3. **Optimize:** nearest-neighbour construction, then **2-opt** improvement
4. **Baseline:** the traditional fixed route = *every* bin in registration order, which is exactly what report §1.1 describes as the problem
5. **Report:** `savedKm`, `fuelSavedL = savedKm / 3.5`, `co2SavedKg = fuelSavedL × 2.68`, time saved at an assumed average speed

Every constant is declared in `/config` and shown in the UI tooltip. Straight-line distance is stated as a limitation in the README — real road-network routing is Phase-II, matching report §2.3.

---

## PART I — Development roadmap

Fifteen modules. One at a time, each production-ready before the next. Sequenced so you always have something demonstrable.

### Foundation

| # | Module | Delivers |
|---|---|---|
| **M01** | Project skeleton + design system | Folders, `tokens.css`, base/layout/glass CSS, constants, README |
| **M02** | Firebase core + auth | Init, login page, role resolution, route guards, security rules file, connection state machine |
| **M03** | Data layer | Schema, typed read/write wrappers, listener manager with teardown, offline queue, seed script |

### Core application

| # | Module | Delivers |
|---|---|---|
| **M04** | Dashboard shell + KPIs | Sidebar, header, provenance banner, all 17 KPI tiles wired to live Firebase |
| **M05** | Bin cards + detail modal | Grid, filtering, sorting, full detail modal with all 17 fields + sparkline |
| **M06** | Smart City map | Leaflet, dark theme, custom markers, pulsing critical bins, filter/search, click→sidebar |
| **M07** | Truck management + routing | Route optimizer, animated truck, optimized vs traditional comparison, savings panel |
| **M08** | Alert Center | Severity queues, acknowledge, resolve, history, filter/search/sort, notification sounds |

### Intelligence

| # | Module | Delivers |
|---|---|---|
| **M09** | Analytics | Chart.js daily/weekly/monthly, fill trends, collection trend, fuel, CO₂, zone heatmap, response time, top critical zones, KPI strip |
| **M10** | Timeline | Full event log, all 10 event kinds, filterable, live-appending |
| **M11** | Simulation Engine | All 11 scenarios, admin gate, kill switch |

### Presentation

| # | Module | Delivers |
|---|---|---|
| **M12** | Landing page | Hero, particles, animated 3D city with roads + trucks, sensor waves, cloud sync, live metrics, objectives, tech stack, **interactive animated architecture with data packets**, timeline, research highlights, CTA, footer |
| **M13** | 3D SmartBin (Three.js) | Lid open/close, garbage fill, sensor beam, LED colour change, truck empty cycle |
| **M14** | Content pages | About (from report wording), Team (corrected USNs, photos, links), Future Scope |
| **M15** | Admin + polish | Settings, thresholds, notification prefs, CSV + PDF export, user management, lazy-loading, a11y audit, responsive pass |

### Firmware (parallel track)

| # | Module | Delivers |
|---|---|---|
| **F01** | ESP32 firmware | HC-SR04 on GPIO5/18, 5-sample median filter, OLED, LED, buzzer, Wi-Fi reconnect with exponential back-off (1 s → 30 s), `StaticJsonDocument<256>`, Firebase writes at 60 s — all per report §5 |

---

## PART J — Enterprise features from the literature survey

The survey names specific gaps. Each becomes a defensible feature rather than decoration:

| Survey finding | Feature |
|---|---|
| §V "gap between monitoring and action" — *the* central criticism | Alert → dispatch → route → collection → resolve, as one closed loop in the Timeline |
| §VII-A predictive monitoring absent | Fill-rate forecast: linear regression over `/history`, projects hours-to-full per bin. Labelled "Statistical projection — not ML" |
| §VI dynamic thresholds by zone/time | Per-bin threshold override in settings |
| §VII-C edge computing | Median filter + threshold check run **on the ESP32**, not the cloud — already true in your firmware, now surfaced in the architecture diagram as an "Edge processing" node |
| §V energy management | Battery panel, drain-rate estimate, low-battery alerts |
| §VII-D security | Auth + roles + published rules + HTTPS, documented |
| §VI formal verification property | System Health asserts *"alert raised within 10 s of threshold breach"* and displays measured worst-case |
| Table I "simulation only" criticism of [20] | The provenance system — your simulation is labelled, theirs wasn't |

---

## PART K — Verification plan

Runs at M15 and after each module:

1. **Formula check** — fill % against report §3.1 at 0/25/50/75/100% with `d_max = 20 cm`
2. **Threshold boundaries** — 50/51, 79/80 transitions produce correct status and colour
3. **Listener teardown** — navigate all views 20×, confirm no duplicate subscriptions or memory growth
4. **Offline path** — kill network, verify queue → reconnect → flush
5. **Role enforcement** — attempt every restricted action as each of the three roles
6. **Provenance** — confirm no `simulated` bin ever renders without its badge
7. **Accessibility** — full keyboard traversal, contrast audit, reduced-motion
8. **Responsive** — 360 / 768 / 1024 / 1440 / 1920
9. **Traceability** — walk report §3.1 and §3.2 line by line against the built system

**Caveat:** without the sandbox I cannot run any of this myself. You'll execute it in the browser and I'll fix what you report. Freeing disk space would let me verify before you ever open the page — worth doing.

---

## Approval

Confirm these five and I start M01:

1. **Firebase, not Blynk** — Blynk references dropped everywhere
2. **Thresholds 0–50 / 51–79 / 80–100**, alert at 80%, admin-configurable to 90
3. **Provenance system** — BIN-001 live, all others visibly labelled simulated
4. **Corrected team data** — Sukesh 1GA23CS171, Sushanth P Raj 1GA23CS175
5. **No build step** — vanilla ES modules + CDN, served over local HTTP

Also tell me:

- Do you have a **Firebase project** already, or should M02 include setup instructions?
- **How many simulated bins** on the map — 12, 24, or 50? Affects map density and analytics realism.
- **Team photos** — drop them in `assets/images/team/` or I'll use the existing initials avatars.
- **Real coordinates** for BIN-001, or do I place it at GAT Rajarajeshwari Nagar (12.9606, 77.4900)?

And separately from the website: **fix report §2.1.1.** That paragraph is about reinforcement learning.
