# Deploying SmartBin to production bins

### Assistant

<details>
<summary>Thinking</summary>





















































</details>

The clone worked. Now let me inspect the architecture before touching anything.

The repo already has a commit for "connect four physical SmartBins", so some of this exists. I'll check what's real and what's still demo.

Much of the plumbing is already there (telemetry API, firmware, four hardware IDs). Next I want to know whether it actually builds and where demo data still leaks in.

The build is currently broken, so the deployed site likely isn't running this code. Next up: the core files.

Status: I've finished reading the repo and I'm now writing the code. The shared hardware config and fill/status logic come first, then the telemetry API, the bin-state model, and finally the pages.

Status: shared core, telemetry API, bin-state model and auth modes are done. I'm now rewriting `DatabaseContext` so everything reads one live bin state, then the dashboard, map and detail pages.

Status: core + components are in place. I'm now rewriting the Dashboard, Map, Bin detail and device-status pages on top of the single bin state, then I'll run the typecheck.

The typecheck now passes. Next I'm cleaning the last fake bits (Admin "System Healthy", Landing stats), then adding tests, the firmware update, docs and the dev scripts.

---

