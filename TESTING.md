# SmartBin+ — Testing Checklist

**Important:** none of this has been executed. The build environment had no
working sandbox, so no file here has been run in a browser. You are the first
person to see whether it works. Expect to find bugs — work through this list in
order, because later sections depend on earlier ones passing.

---

## 0. Before anything else

- [ ] Serve over HTTP, not `file://` — VS Code Live Server, or `python -m http.server 8000`
- [ ] Open the browser console and leave it open. Every error matters.
- [ ] Complete the Firebase setup in `README.md`, including **step 7** (adding your own user record with `role: "administrator"`). Skipping step 7 means you sign in successfully but land with minimum permissions.

---

## 1. Landing page — `index.html`

- [ ] Page loads with no console errors
- [ ] Hero particle field animates; connecting lines fade with distance
- [ ] Counters animate up to 95%, 6.8s, 4.95V, 60s
- [ ] Telemetry marquee scrolls seamlessly (no visible jump at the loop point)
- [ ] Isometric city renders — buildings, roads, bins cycling green → amber → red, two trucks moving
- [ ] Architecture diagram: clicking each of the 8 nodes updates the detail panel
- [ ] Data packets animate along the connectors
- [ ] 3D bin loads when scrolled into view (may take a moment — Three.js is ~600 KB)
- [ ] Dragging the 3D bin rotates it
- [ ] Fill slider changes waste height, colour, LED, and the sensor beam length
- [ ] "Fill to threshold" sets 85% and turns everything red
- [ ] "Collect" opens the lid, empties, closes
- [ ] Sensor distance readout is the inverse of fill: 0% → 20.0 cm, 75% → 5.0 cm
- [ ] All scroll-reveal sections appear as you scroll
- [ ] Nav gains a bottom border after scrolling past 20px
- [ ] Test at 360px, 768px, 1440px widths

**Reduced motion:** enable it in OS settings, reload. Animations should stop, content should still be fully visible.

---

## 2. Authentication — `login.html`

- [ ] Unconfigured Firebase shows the setup screen, not a raw SDK error
- [ ] Wrong password shows "Incorrect email or password"
- [ ] Unknown email shows the **same** message (this is deliberate — it prevents account enumeration)
- [ ] Correct credentials redirect to `dashboard.html`
- [ ] SHOW/HIDE toggle reveals the password
- [ ] "Forgot your password?" reports success even for an unregistered address (also deliberate)
- [ ] Already signed in → visiting `login.html` redirects straight to the dashboard
- [ ] Tab order: skip link → email → password → show → sign in → forgot

---

## 3. Dashboard shell — `dashboard.html`

- [ ] Sidebar shows only routes your role permits (Simulation and Settings are administrator-only)
- [ ] Connection pill reads CONNECTED with a latency figure
- [ ] Header clock ticks
- [ ] Theme toggle switches to light and persists across reload
- [ ] Sign out returns to login and clears state
- [ ] At <1024px the sidebar becomes a drawer; the hamburger opens it; Escape closes it

**Empty state:** before seeding, the dashboard should show the "database is empty" card with the seed command, not a wall of dashes.

---

## 4. Seeding

Run once in the console, signed in as administrator:

```js
import('./firebase/seed.js').then(m => m.seedDatabase());
```

- [ ] Four bins registered: BIN-001 to BIN-004
- [ ] One truck: TRK-01
- [ ] All four bins show the **PENDING** badge (dashed border, diagonal hatch)
- [ ] Provenance banner appears: "4 awaiting hardware"
- [ ] Running it a second time skips existing bins rather than duplicating

---

## 5. The formula — verify this carefully

This is the single most important correctness check. With `depthCm = 20`:

| Distance | Expected fill | Expected status |
|---|---|---|
| 20.0 cm | 0% | Empty |
| 15.0 cm | 25% | Empty |
| 10.0 cm | 50% | Empty |
| 9.8 cm | 51% | Half |
| 4.2 cm | 79% | Half |
| 4.0 cm | 80% | **Full — alert fires** |
| 0.0 cm | 100% | Full |

Test via the browser console:

```js
const { calculateFillPercent, classifyFillStatus } = await import('./js/utils/fill.js');
[20, 15, 10, 9.8, 4.2, 4, 0].forEach(d =>
  console.log(d, calculateFillPercent(d, 20), classifyFillStatus(calculateFillPercent(d, 20)))
);
```

- [ ] Every row matches
- [ ] Boundaries are correct: 50 is Empty, 51 is Half, 79 is Half, 80 is Full

---

## 6. Simulation Engine

- [ ] Enable simulation mode — banner turns amber across every page
- [ ] Select BIN-001, run **Increase waste** — fill climbs every 2 seconds
- [ ] Bin badge changes from PENDING to **SIM**
- [ ] Colour transitions at 51% and again at 80%
- [ ] Crossing 80% raises a critical alert and shows a toast tagged "SIMULATED DATA"
- [ ] Alert count appears in the header
- [ ] **Sensor failure** → sensor fault alert, health score drops
- [ ] **Battery drain** → warning at 20%, critical at 10%
- [ ] **Network failure** → bin goes offline after ~3 minutes (3 × 60 s)
- [ ] **Firebase disconnect** → connection pill goes through OFFLINE → RECONNECTING → CONNECTED within ~12 s
- [ ] **Truck collection** → bin empties, alerts resolve, timeline entry appears
- [ ] **Emergency overflow** → jumps to 100%, critical alert
- [ ] **Fire** / **Rain** → values appear in the modal's Planned Sensors section, marked Phase-II
- [ ] Stop all → continuous scenarios halt
- [ ] Clear simulation → bin returns to PENDING

---

## 7. Bins and detail modal

- [ ] Filter chips show correct counts and filter correctly
- [ ] Search matches ID, label and zone
- [ ] Each sort option reorders correctly
- [ ] Clicking a card opens the modal
- [ ] Gauge arc matches the fill percentage
- [ ] All telemetry fields populate; missing values show **—**, never 0
- [ ] Sparkline draws after enough history exists (run Increase waste for a minute first)
- [ ] Threshold line appears on the sparkline at 80%
- [ ] Health score decomposes into named factors
- [ ] Escape closes the modal
- [ ] Tab is trapped inside the modal
- [ ] Focus returns to the card that opened it

---

## 8. Map

- [ ] Leaflet loads, dark tiles render
- [ ] Four markers appear around the GAT campus
- [ ] Simulated markers have a dashed ring
- [ ] Critical bins pulse
- [ ] Clicking a marker opens a popup; "View full details" opens the modal
- [ ] Sidebar list and map stay in sync
- [ ] "Fit to deployment" reframes correctly
- [ ] Theme toggle swaps to light tiles

---

## 9. Routing

- [ ] With no bins above threshold: shows "no collection required" plus the traditional-round distance
- [ ] Fill two bins past 80% → route appears with both stops
- [ ] Comparison bars are proportional
- [ ] Percentage reduction is arithmetically correct: `savedKm ÷ traditionalKm`
- [ ] Method panel lists the algorithm and every assumption
- [ ] "Mark collected" empties the bin and resolves its alerts
- [ ] Dispatch writes a truck record and a timeline event
- [ ] Route polyline draws on the map

---

## 10. Alerts

- [ ] Alerts sorted by severity, then recency
- [ ] Filters work; counts are accurate
- [ ] Acknowledge records who and when
- [ ] Resolve moves the alert to the resolved filter
- [ ] Mean response time appears after the first acknowledgement
- [ ] Simulated alerts carry the SIM badge

---

## 11. Analytics

- [ ] Chart.js loads
- [ ] Fill trend draws with the threshold line
- [ ] Gaps appear where no readings exist (not zeroes)
- [ ] Per-bin comparison bars are colour-banded correctly
- [ ] Band doughnut totals 100%
- [ ] Range selector changes the x-axis
- [ ] Bin selector switches between fleet and individual
- [ ] Projections show hours-to-threshold once enough history exists

---

## 12. Timeline

- [ ] Events group under Today / Yesterday / dated headings
- [ ] All event kinds render with the right icon and colour
- [ ] Filters and search work
- [ ] New events appear live while a scenario runs

---

## 13. Settings

- [ ] Threshold rejects values outside 80–90
- [ ] Saved config propagates to other open tabs immediately
- [ ] Editing a bin's coordinates moves its map marker
- [ ] Adding a bin registers it as PENDING
- [ ] Deleting prompts for confirmation
- [ ] User role dropdown updates the record
- [ ] CSV exports open correctly in Excel — check the ° and ₂ characters are not mangled
- [ ] CSV includes the data-source column
- [ ] PDF report opens in a new window and prints cleanly

---

## 14. Listener leak check — do not skip this

The most likely long-running bug in this build.

```js
const l = await import('./firebase/listeners.js');
l.activeListenerCount();   // note this number
```

- [ ] Navigate through every view **20 times**
- [ ] Run `activeListenerCount()` again — it must be the **same number**
- [ ] Open and close the bin modal 20 times — same again
- [ ] If the count climbs, a view's teardown is not running

---

## 15. Accessibility

- [ ] Tab through every page — focus is always visible
- [ ] No keyboard trap outside modals
- [ ] Screen reader announces new alerts (live regions)
- [ ] Every status is conveyed by icon + text, not colour alone
- [ ] `prefers-reduced-motion` stops all animation
- [ ] Zoom to 200% — nothing overlaps or is cut off

---

## 16. Firmware

Once the ESP32 is flashed:

- [ ] Serial monitor at 115200 shows the startup banner
- [ ] OLED displays the bin ID and fill percentage
- [ ] Covering the sensor at a known distance produces the expected percentage
- [ ] LED lights at 80%
- [ ] Buzzer beeps on the rising edge only, not continuously
- [ ] Readings appear in the dashboard within 10 seconds
- [ ] **Bin flips from PENDING to LIVE automatically** — this is the provenance system working
- [ ] Disconnect Wi-Fi → serial shows back-off doubling 1 s → 2 s → 4 s → … → 30 s
- [ ] Reconnect → uploads resume, delivery rate recovers
- [ ] Leave running for an hour — free heap should stay stable (this is what `StaticJsonDocument` is for)

---

## Known risks

Written down so you know where to look first when something breaks.

1. **Nothing has been executed.** Import paths, typos, and small logic errors are likely. The console will tell you.
2. **CDN dependencies** — Firebase, Leaflet, Chart.js and Three.js all load from CDN. On a restricted campus network any of them may be blocked. Each has a fallback message, but the feature will be unavailable.
3. **Alert engine runs client-side.** No dashboard open means no alerts recorded. Documented in About → Limitations.
4. **Simulation tick is 2 seconds, not 60.** Deliberate, so a demo does not take an hour. The write path is identical to the real device.
5. **Placeholder coordinates.** All four bins sit around GAT campus at made-up positions until you survey the real ones and enter them in Settings.
